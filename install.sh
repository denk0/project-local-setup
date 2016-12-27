#!/bin/sh
repo_url=$1;
port=${2:-8081};
mkdir temp_dir;
git clone $repo_url temp_dir/;
cd temp_dir/;
project_name=$(git remote show origin -n | grep h.URL | sed 's/.*\///;s/.git$//');
cd ..;
mv temp_dir/ $project_name/;


SQLNAME="${project_name//\-/_}";
echo "CREATE DATABASE $SQLNAME" > install.sql;
docker exec -i mysql mysql -uroot -proot --force < install.sql;
docker exec -i mysql mysql -uroot -proot --force $SQLNAME < $project_name/wp-database/$SQLNAME.sql;
rm -f install.sql;

wordpress=$(docker run -e WORDPRESS_DB_USER=root -e WORDPRESS_DB_PASSWORD=root -e WORDPRESS_DB_NAME=$SQLNAME -d --name $project_name --link mysql:mysql -p $port:80 -v "$PWD/$project_name/":/var/www/html  wordpress);
echo "$wordpress";

chmod +x $project_name/wp-database/srdb.cli.php;

echo "docker exec -i mysql mysqldump -uroot -proot $SQLNAME > wp-database/$SQLNAME.sql" > $project_name/dumpdb.sh;
chmod +x $project_name/dumpdb.sh;

echo "docker exec -i mysql mysqldump -uroot -proot $SQLNAME < wp-database/$SQLNAME.sql" > $project_name/updatedb.sh;
chmod +x $project_name/updatedb.sh;

# splitting project name to client + project
tmp="$project_name";
IN="$tmp";
set -- "$IN" ;
IFS="_"; declare -a Array=($*);
client="${Array[0]}";
project="${Array[1]}";

site_link=$(docker port $wordpress 80);
echo "Your site is available on $site_link";

echo "<?php \$port = \"$site_link\" ?>" > $project_name/wp-database/port.php;

# run srdb
srdb="docker exec -d $wordpress php wp-database/srdb.cli.php -h mysql --port=3306 -u root -p root -n $SQLNAME -s 'http://git.beetroot.se:8081/$client/$project' -r 'http://localhost:$port'";
echo "$srdb" >> updatedb.sh;
echo "$srdb" >> $project_name/updatedb.sh;
chmod +x updatedb.sh;
./updatedb.sh;
rm -f updatedb.sh;