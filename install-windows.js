const path = require('path');
const exec = require('child_process').exec;
const fs = require('fs');

// Get git repo url from arguments
let gitRepo = process.argv[2];
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};
// Get port if its passed as argument
let port = process.argv[3] ? +process.argv[3] : 8081;
dockerPorts = new Promise((resolve, reject) => {
    let dockerContainers = exec(`docker ps -a`, (error, stdout) => {
        let output = stdout.split('\n');
        let containers = output.slice(1, output.length - 1);

        function getAccessiblePort(port) {
            return containers.every(container => !container.includes(String(port))) ? port : getAccessiblePort(++port);
        }
        port = getAccessiblePort(port)
        if (error !== null) {
            console.log('Docker error: ' + error);
        }
    });

    dockerContainers.on('close', (code) => {
        if (code === 0) {
            console.log(`Docker: Ready to install your project!`);
            resolve();
        } else {
            console.log(`Docker: Fail`);
            reject();
            process.exit();
        }
    });
});



// Extract project name from git url
let projectName = gitRepo.split('/')[4].replace('.git', '');
let client = projectName.split('_')[0];
let project = projectName.split('_')[1];
// Repalce dashes to underscores for DB name
let dbName = `${client.slice(0, 7)}_${project.slice(0, 7)}`.replaceAll('-', '_');

// Clone repo
let gitClonePromise = new Promise((resolve, reject) => {
    let cloneTask = exec(`git clone ${gitRepo} ${projectName}`);

    cloneTask.stderr.on('data', (data) => {
        console.log(`git: ${data}`);
    });
    cloneTask.on('close', (code) => {
        if (code === 0) {
            console.log(`git: Reposiory cloned successfully`);
            resolve();
        } else {
            console.log(`git: Failed to clone repository`);
            reject();
            process.exit();
        }
    });
});
// Create SQL table installation file
let createInstallSQL = new Promise((resolve, reject) => {
    gitClonePromise.then(() => {
        console.log('fs: Creating install.sql..');
        // Create SQL config file
        fs.writeFileSync("install.sql", `CREATE DATABASE ${dbName}; ALTER DATABASE ${dbName} CHARACTER SET utf8 COLLATE utf8_general_ci;`, function(err) {
            if (err) {
                reject();
                return console.log(err);
            }
        });
        console.log("fs: install.sql created successfully");
        resolve();
    });
});
// Execute install.sql (creates DB with project name inside docker MySQL)
let importInstallSQL = new Promise((resolve, reject) => {
    createInstallSQL.then(() => {
        let dockerSqlCreate = exec('docker exec -i mysql mysql -uroot -proot --force < install.sql');
        dockerSqlCreate.on('close', (code) => {
            if (code === 0) {
                console.log('docker: install.sql executed successfully - database created');
                // Remove config file
                fs.unlink('install.sql', (err) => {
                    if (err) console.log(err);
                });
                resolve();
            } else {
                console.log('docker: failed to execute install.sql');
                reject();
            }
        });
    });
});
// Import database from cloned repo
let importDbFromRepo = new Promise((resolve, reject) => {
    importInstallSQL.then(() => {
        let dockerSqlImport = exec(`docker exec -i mysql mysql -uroot -proot --force ${dbName} < ${projectName}/wp-database/${dbName}.sql`);
        dockerSqlImport.stderr.on('data', (data) => {
            console.log('docker: database from git repo has not imported or imported with: ', data);
            resolve();
        });
        dockerSqlImport.on('close', (code) => {
            console.log('docker: database from git repo imported successfully');
            resolve();
        });
    });
});
// Install Docker Wordpress
let wordpressSetup = new Promise((resolve, reject) => {
    importDbFromRepo.then(() => {
        let PWD = __dirname;
        let dockerWordpressSetup = exec(`docker run -e WORDPRESS_DB_USER=root -e WORDPRESS_DB_PASSWORD=root -e WORDPRESS_DB_NAME=${dbName} -d --name ${projectName} --link mysql:mysql -p ${port}:80 -v ${PWD}\\${projectName}:/var/www/html  wordpress`);

        dockerWordpressSetup.on('close', (code) => {
            if (code === 0) {
                console.log('docker: Wordpress container created successfully');
                resolve();
            }
        });
    })
});
// Create files for DB dump and update
let createDumpUpdateFiles = new Promise((resolve, reject) => {
    wordpressSetup.then(() => {
        exec(`chmod +x ${projectName}/wp-database/srdb.cli.php`);
        console.log('fs: srdb.cli.php chmod - success');

        fs.writeFileSync(`${projectName}/dumpdb.sh`, `alter_tables=$(docker exec -i mysql mysql -uroot -proot <<< 'SELECT CONCAT("ALTER TABLE ", TABLE_NAME," CONVERT TO CHARACTER SET utf8 COLLATE utf8_general_ci") AS \`SET sql_mode = ""; USE ${dbName};\` FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA="${dbName}" AND TABLE_TYPE="BASE TABLE"');
alter_tables=(\$\{alter_tables\/\/'utf8_general_ci'\/utf8_general_ci; \});
docker exec -i mysql mysql -uroot -proot <<< \$\{alter_tables[@]\};
docker exec -i mysql mysqldump -uroot -proot ${dbName} > wp-database/${dbName}.sql`, function(err) {
            if (err) {
                return console.log(err);
            }
        });
        exec(`chmod +x ${projectName}/dumpdb.sh`);
        console.log('fs: dumpdb.sh created');

        fs.writeFileSync(`${projectName}/wp-database/port.php`, `<?php $port = ${port} ?>`, (err) => {
            if (err) {
                return console.log(err);
            }
        });
        console.log('fs: port.php created');
        resolve();
    });
});

// Run SRDB and create updatedb.sh
let srdDbRoutine = new Promise((resolve, reject) => {
    createDumpUpdateFiles.then(() => {
        // Check --port=3306
        let srdbScript = `docker exec -d ${projectName} php /var/www/html/wp-database/srdb.cli.php -h mysql --port=3306 -u root -p root -n ${dbName} -s "http://git.beetroot.se:8081/${client}/${project}" -r "http://localhost:${port}"`;

        fs.writeFileSync(`${projectName}/updatedb.sh`, srdbScript, function(err) {
            if (err) {
                return console.log(err);
            }
        });
        exec(`chmod +x ${projectName}/updatedb.sh`);
        console.log('fs: updatedb.sh created');

        let srdbRun = exec(srdbScript);
        srdbRun.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        srdbRun.stderr.on('data', (data) => {
            console.log(`stderr: ${data}`);
        });
        srdbRun.on('close', (code) => {
            if (code === 0) {
                console.log(`Project created successfully at http://localhost:${port}`);
                resolve();
                process.exit();
            } else {
                console.log('Error: Something went wrong while running SRDB');
                reject();
                process.exit();
            }
        });
    })
});