#!/usr/bin/node

// Beetrace Copyright (C) 2018 PlatyPew
// GNU AFFERO GENERAL PUBLIC LICENSE

const execSync = require('child_process').execSync;
const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const async = require('async');

const SERVICE_PROFILE_PATH = __dirname + "/src/etc/profiles/";
const PLUGIN_PATH = __dirname + '/src/plugins/';
const INTERFACE = 'eth0';
const NETWORK_FILE = '/etc/network/interfaces';
const LENGTH_OF_LOGDIR = 16
const PHYSICAL_MEMORY_LIMIT = '8M';

var url = 'mongodb://localhost:27017/';
const DB_NAME = 'BeeTrace';
const COLLECTION_NAME = 'honeypots';
const COLLECTION_NAME_LOGS = 'honeylogs'

// Local functions

function parseNetwork() {
	var data = fs.readFileSync(NETWORK_FILE, {encoding: 'utf-8'});
	var regex = /# BeeTrace Configuration([\s\S]+)# End of BeeTrace Configuration/g;
	configuration = data.match(regex)[0].split('\n');
	existingdata = data.split(regex);

	return configuration[1].split(' ')[1], existingdata
}

function fromCIDR(num) {
	var final = [];
	var binary = '1'.repeat(num);
	binary = binary + '0'.repeat(32 - binary.length);
	binary = binary.match(/.{8}/g);
	
	for (var i = 0; i < binary.length; i++) {
		final.push(JSON.stringify(parseInt(binary[i] ,2)));
	}
	
	return final.join('.');
}

function newInterface(network) {
	ip = network.split('/')[0];
	netmask = fromCIDR(Number(network.split('/')[1]));
	var config = parseNetwork();
	var re = new RegExp(`/auto ${INTERFACE}:\d+`, 'g');
	var info = config[1].match(/auto eth0:\d+/g);
	var currentHost = 0;
	if (info !== null) {
		currentHost = Number(info[info.length - 1].split(' ')[1].split(':')[1])	
	}
	
	var newConfig = `# Start ${INTERFACE}:${currentHost + 1}
auto ${INTERFACE}:${currentHost + 1}
iface ${INTERFACE}:${currentHost + 1} inet static
address ${ip}
netmask ${netmask}
# End ${INTERFACE}:${currentHost + 1}
`;

	config[1] = '# BeeTrace Configuration' + config[1] + newConfig + '# End of BeeTrace Configuration';
	return {
		config: config.join(''),
		interface: `${INTERFACE}:${currentHost +1}`
	}
}

function removeInterface(interface) {
	var config = parseNetwork();
	var regex = new RegExp(`# Start ${interface}[\\s\\S]+# End ${interface}`);
	config[1] = `# BeeTrace Configuration
${config[1].trim().split(regex).join('').trim().replace('\n\n', '\n')}
# End of BeeTrace Configuration`.replace('\n\n','\n');
	return config.join('');
}

function checkFile(serviceProfile, callback) {
	try {
		fs.readdirSync(SERVICE_PROFILE_PATH, {encoding: 'utf-8'});
	} catch (e) {
		callback(e);
	}
}

function iniParse(serviceProfile, callback) {
	try {
		var data = fs.readFileSync(SERVICE_PROFILE_PATH + serviceProfile, {encoding: 'utf-8'});
		data = data.split('\n').filter(function(a) {
			return a !== ''
		});
		var filtered = [];
		for (var i = 0; i < data.length; i++) {
			var line;
			var majiks = data[i].match('#');
			if (majiks !== null) {
				line = data[i].substring(0, majiks.index).trim();
			} else {
				line = data[i];
			}
			if (line !== '') {
				filtered.push(line);
			}	
		}
		var jsonData = {};
		var nameOfService = '';
		for (var i = 0; i < filtered.length; i++) {
			if (filtered[i].match(/\[.+\]/) !== null) {
				nameOfService = filtered[i].substring(1, filtered[i].length - 1);
				jsonData[nameOfService] = {};
			} else {
				var info = filtered[i].split('=');
				if (info[0].trim() !== 'low_port') {
					jsonData[nameOfService][info[0].trim()] = info[1].trim();
				}
			}
		}
		callback(null, jsonData);
	} catch (e) {
		callback(e);
	}
	
}

function pluginList(callback) {
	try {
		var files = fs.readdirSync(PLUGIN_PATH, {encoding: 'utf-8'});
		files.splice(files.indexOf('__init__.py'), 1)
		callback(null, files);
	} catch (e) {
		callback(e);
	}
}

function parseData(serviceProfile, host, callback) {
	var outFiles;
	var outConfig;
	pluginList(function (err, files) {
		if (err) callback(err);
		outFiles = files;
	});
	iniParse(serviceProfile, function(err, config) {
		if (err) callback(err);
		outConfig = config;
	});
	var dockerPorts = [];
	for (var i = 0; i < Object.keys(outConfig).length; i++) {
		var info = outConfig[Object.keys(outConfig)[i]];
		if (outFiles.indexOf(info.plugin) === -1) callback(`Error: Plugin ${info.plugin} does not exist`);
		if (info.enabled.toLowerCase() === 'yes') {
			dockerPorts.push(`-p ${host.split('/')[0]}:${info.port.split(':')[1]}:${info.port.split(':')[1]}/${info.port.split(':')[0]}`);
		}
	}
	callback(null, dockerPorts.join(' '), outConfig);
}

function system(cmd, callback) {
	try {
		var stdout = execSync(cmd, {encoding: 'utf-8'});
		callback(null, stdout);
	} catch (e) {
		callback(e);
	}
}

function nameTaken(name, callback) {
	system('docker ps -a --format "{{.Names}}"', function(err, stdout) {
		if (err) callback(err);
		if (name === '') {
			callback(null, false);
		} else if (stdout.trim().split('\n').indexOf(name) === -1) {
			callback(null, false);
		} else {
			callback(null, true);
		}
	});
}

function read(file, callback) {
	fs.watchFile(file, {interval: 500}, function (curr, prev) {
		fs.readFile(file, {encoding: 'utf-8'}, function (err, data) {
			if (err) callback(err);
			if (data !== '' && !err) {
				fs.writeFile(file, '', function (err) {
					if (err) callback(err);

					var serve = {};

					output = data.trim().split('\n');
					for (var i = 0; i < output.length; i++) {
						var info = output[i].trim().split(' ');
						if (info[8] === '->') {
							info.splice(3, 1)
						}	
						if (info[7] === '->') {
							var jsonData = {};
							jsonData.date = info[0].replace(/\0/g, '');
							jsonData.time = info[1].split(',')[0];
							jsonData.protocol = info[4];
							jsonData.sourceIP = info[5];
							jsonData.sourcePort = info[6];
							jsonData.destinationIP = info[8];
							jsonData.destinationPort = info[9];
							jsonData['data'] = info[10];
							if (serve[info[3]] === undefined) serve[info[3]] = [];
							serve[info[3]].push(jsonData);
						}
					}
					if (Object.keys(serve).length !== 0) {
						callback(null, serve);
					}
				});
			}
		});
	});
}

function trackLogs(file, folder, callback) {
	MongoClient.connect(url, {useNewUrlParser: true}, function(err, db) {
		if (err) throw err;
		var dbo = db.db(DB_NAME);
		var myquery = {_id: folder};

		read(file, function (err, data) {
			if (!err) {
				for (var i = 0; i < Object.keys(data).length; i++) {
					var service = Object.keys(data)[i];
					var array = data[Object.keys(data)[i]];

					var newvalues = {$addToSet: {}};
					newvalues['$addToSet'][`services.${service}`] = {$each: array};

					dbo.collection(COLLECTION_NAME_LOGS).updateOne(myquery, newvalues, function(err, res) {
						if (err) callback(err);
						
					});
					
				}
			}
		});
	});
}

(function () {
	MongoClient.connect(url + DB_NAME, {useNewUrlParser: true}, function(err, db) {
		if (err) callback(err);
		var dbo = db.db(DB_NAME);
		dbo.collection(COLLECTION_NAME).find({}).toArray(function(err, result) {
			if (err) callback(err);
			db.close();
			for (var i = 0; i < result.length; i++) {
				var dir = result[i].logfile;
				trackLogs(`${__dirname}/logs/${dir}/honeypy.log`, dir, function (err) {if (err) callback(err);});
			}
		});
	});
})();

///////////////////////////////////////////////////////////////////////////////////

// API functions

var help = {
	list: `FUNCTIONS
  init() - Initialises MongoDB and Docker Images
	.init(callback);

  create() - Creates a honeypot on a virtualised host
	.create(service, host, name, callback);

  remove() - Removes honeypot and virtualised host
  	.remove(name, callback);

  status() - Sets the status of honeypot
	.staus(status, callback);

  purge() - Removes all honeypots and virtualised hosts
	.purge(callback);

  quickPurge() - Removes all honeypots as fast as possible
	.quickPurge(callback);`,
	init: `NAME
  init() - Initialises MongoDB and Docker Images
USAGE
  .init(callback);

EXAMPLE
  Initialise docker image and mongodb
	.init(function (err, stdout) {
		if (err) throw err;
		console.log(stdout);
	});`,
	create: `NAME
  create() - Creates a honeypot on a virtualised host

USAGE
  .create(service, host, name, callback);

EXAMPLE
  Create a container with random name
	.create("services.common.profile", "192.168.0.10/24", null, function (err, json, msg) {
		if (err) throw err;
		console.log(json); // Prints json information of honeypot created
		console.log(msg); // Prints if honeypot creation is successful
	});

  Create a container with assigned name
	.create("services.common.profile", "192.168.0.10/24", "my-honey-pie", function (err, json, msg) {
		if (err) throw err;
		console.log(json); // Prints json information of honeypot created
		console.log(msg); // Prints if honeypot creation is successful
	});`,
	remove: `NAME
  remove() - Removes honeypot and virtualised host

USAGE
  .remove(name, callback);

EXAMPLE
  Remove a container by name
	.remove('my-honey-pie', function(err, json, msg) {
		if (err) throw err;
		console.log(json); // Prints json information of honeypot removed
		console.log(msg); // Prints if honeypot was successfully removed
	});`,
	edit: `NAME
  edit() - Allow honeypot configuration editing

USAGE
  .edit(currentName, newServiceProfile, newHost, newName, callback);

EXAMPLE
  Change container's name, service and profile (Reuse values for arguments that have to be kept the same)
	// Null is also accepted in the newName parameter to randomly generate a new name
	.edit('my-honey-pie', 'services.edited.profile', 'my-honey-pie-two', function(err, json, msg) {
		if (err) throw err;
		console.log(json); // Prints json information of honeypot removed
		console.log(msg); // Prints if honeypot was successfully removed
	});`,
	status: `NAME
  status() - Sets the status of honeypot

USAGE
  .staus(status, callback);

EXAMPLE
  Sets the status of honeypot
	.status(.RESTART, 'my-honey-pie',function (err, msg) {
		if (err) throw err;
		console.log(msg); // Prints if honeypot status was successfully set
	});

LIST
  List of variables to use to set honeypot status
	{
		START: 1,
		STOP: 2,
		RESTART: 3
	}`,
	purge: `NAME
  purge() - Removes all honeypots and virtualised hosts

USAGE
  .purge(callback);

EXAMPLE
  Removes every running honeypot container
	.purge(function (err, json, msg) {
		if (err) throw err;
		console.log(json); // Prints json information of honeypot removed
		console.log(msg); // Prints if honeypot was successfully removed
	});`
}

var init = function(callback) {
	system(`docker build --build-arg service="service-sample" -t honeypy ${__dirname}`, function(err, stdout) {
		if (err) callback(err);
		callback(null, stdout);
	});

	MongoClient.connect(url + DB_NAME, {useNewUrlParser: true}, function(err, db) {
		if (err) callback(err);
		var dbo = db.db(DB_NAME);
		dbo.createCollection(COLLECTION_NAME, function(err, res) {
			if (err) callback(err);
		});

		dbo.createCollection(COLLECTION_NAME_LOGS, function(err, res) {
			if (err) callback(err);
			db.close();
		});
	});
};

var create = function(service, host, name, callback) {
	if (name === null) {
		name = ''
	} else {
		name = `--name ${name}`
	}

	var interfaceConfig = newInterface(host);

	checkFile(service, function(err, found) {
		if (err) callback(err);
	});

	var outPorts;
	var outConfig;

	parseData(service, host, function(err, ports, config) {
		if (err) callback(err);
		outPorts = ports;
		outConfig = config;
	});

	nameTaken(name, function(err, taken) {
		if (err) callback(err);
		if (taken) callback('Error: Container name taken');
	});

	var dir;
	var dirpath;

	fs.writeFileSync(NETWORK_FILE, interfaceConfig.config, {encoding: 'utf-8'});

	system('service networking restart', function(err, stdout) {
		if(err) callback('Error: Service networking could not be restarted');
	});

	dir = 'BTrace-' + require('crypto').randomBytes(Math.ceil(LENGTH_OF_LOGDIR/2)).toString('hex');
	dirpath = __dirname + '/logs/' + dir;

	try {
		fs.mkdirSync(dirpath);
	} catch (e) {
		callback(e);
	}

	system(`docker build --build-arg service="${service}" -t honeypy ${__dirname} && docker run -v ${dirpath}:/opt/honeypy/log --restart always --memory ${PHYSICAL_MEMORY_LIMIT} -dt ${outPorts} ${name} honeypy`, function(err, stdout) {
		if(err) callback(err);
	});
							
	system('docker ps -a --format "{{.Names}}|{{.Status}}" | head -n 1', function(err, finalStdout) {
		if (err) callback(err);
		var name = finalStdout.trim().split('|')[0];
		var jsonData = {
			_id: name,
			host: host,
			interface: interfaceConfig.interface,
			serviceProfile: service,
			logfile: dir,
			status: finalStdout.trim().split('|')[1].split(' ')[0],
			serviceList: outConfig
		};
		
		MongoClient.connect(url, {useNewUrlParser: true}, function(err, db) {
			if (err) callback(err);
			var dbo = db.db(DB_NAME);
			dbo.collection(COLLECTION_NAME).insertOne(jsonData, function(err, res) {
				if (err) callback(err);
			});

			var honeylogs = {
				_id: dir,
				services: {}
			};

			Object.keys(jsonData.serviceList).forEach(function (key) {
				honeylogs.services[key] = [];
			});

			dbo.collection(COLLECTION_NAME_LOGS).insertOne(honeylogs, function(err, res) {
				if (err) callback(err);
				
				fs.closeSync(fs.openSync(`${__dirname}/logs/${dir}/honeypy.log`, 'w'));
				trackLogs(`${__dirname}/logs/${dir}/honeypy.log`, dir, function (err) {if (err) callback(err);});
				callback(null, jsonData, `Honeypot "${name}" has been successfully created`);
			});

			db.close();
		});
	});
};

var remove = function(name, callback) {
	nameTaken(name, function(err, taken) {
		if (err) callback(err);
		if (!taken) callback('Error: Container does not exist');
	});

	MongoClient.connect(url, {useNewUrlParser: true}, function(err, db) {
		if (err) callback(err);
		var dbo = db.db(DB_NAME);
		var query = {_id: name}

		dbo.collection(COLLECTION_NAME).find(query).toArray(function(err, result) {
			if (err) callback(err);
			var jsonData = result[0];

			dbo.collection(COLLECTION_NAME).deleteOne(query, function(err, obj) {

				dbo.collection(COLLECTION_NAME_LOGS).deleteOne({_id: jsonData.logfile}, function (err, obj) {
					db.close();

					system(`ip addr del ${jsonData.host} dev ${jsonData.interface}`, function(err, stdout) {
						if (err) callback(err);
						fs.writeFileSync(NETWORK_FILE, removeInterface(jsonData.interface), {encoding: 'utf-8'});
					});

					fs.unwatchFile(`${__dirname}/logs/${jsonData.logfile}`);

					system(`docker stop ${name} && docker rm ${name} && rm -rf ${__dirname}/logs/${jsonData.logfile}`, function(err, stdout) {
						if (err) callback(err);

						callback(null, jsonData, `Honeypot "${name}" has been successfully removed`)
					});
				});
			});
		});
	});
};

var edit = function(oldName, newProfile, newIP, newName, callback) {
	MongoClient.connect(url, {useNewUrlParser: true}, function(err, db) {
		if (err) callback(err);
		var dbo = db.db(DB_NAME);
		dbo.collection(COLLECTION_NAME).find({_id: oldName}).toArray(function(err, result) {
			if (err) callback(err);
			dbo.collection(COLLECTION_NAME_LOGS).find({_id: result[0].logfile}).toArray(function(err, result) {
				if (err) callback(err);
				var logs = result[0].services;
				remove(oldName, function (err, json1, msg1) {
					if (err) callback(err);
					create(newProfile, newIP, newName, function (err, json2, msg2) {
						if (err) callback(err);
						var count = 0;
						var iter = function (data, done) {
							var newvalues = {};
							newvalues[`services.${Object.keys(logs)[count]}`] = data;
							
							dbo.collection(COLLECTION_NAME_LOGS).updateOne({_id: json2.logfile}, {$set: newvalues}, function (err, result) {
								if (err) callback(err);
							});
							count++;
						}

						var doneIter = function(err) {
							callback(err);
						}

						async.forEach(logs, iter, doneIter);
						
						callback(null, json2, msg2)
						db.close();
					});
				});
			});
		});
	});
};

var status = function(status, container, callback) {
	var cmd;
	nameTaken(container, function(err, taken) {
		if (err) callback(err);
		if (!taken) callback('Error: Container does not exist!');
	});

	switch (status) {
		case 0:
			cmd = 'start';
			break;
		case 1:
			cmd = 'stop';
			break;
		case 2:
			cmd = 'restart';
			break;
		default:
			callback('Error: Not a valid status!');
	}

	system(`docker ${cmd} ${container}`, function (err, stdout) {
		if (err) callback(err);
		MongoClient.connect(url, {useNewUrlParser: true}, function(err, db) {
			if (err) callback(err);
			var dbo = db.db(DB_NAME);
			system(`docker ps -a -f 'name=${container}' --format '{{.Status}}'`, function(err, statusStdout) {
				var newValues = {$set:{status: statusStdout.split(' ')[0]}};
				dbo.collection(COLLECTION_NAME).updateOne({_id: container}, newValues, function(err, res) {
					if (err) callback(err);
					db.close();
					callback(null, `Honeypot "${container}" ${cmd} complete!`);
				});
			});
		});
	});
};

var purge = function(callback) {
	var containers;
	system('docker ps -a --format "{{.Names}}"', function(err, finalStdout) {
		if (err) callback(err);
		containers = finalStdout.trim().split('\n');
	});
	for (var i = 0; i < containers.length; i++) {
		remove(containers[i], function(err, json, msg) {
			if (err) callback(err);
			callback(null, json, msg);
		});
	}
};

///////////////////////////////////////////////////////////////////////////////////

module.exports = {
	help: help,

	START: 0,
	STOP: 1,
	RESTART: 2,

	init: init,
	create: create,
	remove: remove,
	edit: edit,
	status: status,
	purge: purge
}
