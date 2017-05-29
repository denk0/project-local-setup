<h2>See requirements and structure <a href="http://git.beetroot.se/vromanenko/barebone-local-setup" target="_blank">here</a></h2>
<h2>Install project</h2>
<ul>
    <li>Open terminal as administrator from <code>sites/</code> folder.</li>
    <li>Run <code>node install http://git.beetroot.se/user/project</code> (or <code>node install-windows http://git.beetroot.se/user/project</code>).</li>
    <li>In order to install project to specific port add another argument to your process. <code>node install http://git.beetroot.se/user/project 8086</code></li>
</ul>
<h2>Usage</h2>
<ul>
    <li>Create development branch after installing <code>git checkout -b development</code> and work on it.</li>
    <li>Make sure to run <code>./dumpdb.sh</code> before <code>git add .</code> command. It will create current database dump.</li>
    <li>Create a merge request to master after pushing your development branch (see terminal output after pushing, it will generate merging link).</li>
    <li>Ask your team lead to review merge request.</li>
</ul>