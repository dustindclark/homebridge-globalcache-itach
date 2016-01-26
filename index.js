var net = require("net");
var Service, Characteristic, Accessory, uuid;
var inherits = require('util').inherits;
var extend = require('util')._extend;

/* Register the plugin with homebridge */
module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.hap.Accessory;
    uuid = homebridge.hap.uuid;

    var acc = ItachAccessory.prototype;
    inherits(ItachAccessory, Accessory);
    ItachAccessory.prototype.parent = Accessory.prototype;
    for (var mn in acc) {
        ItachAccessory.prototype[mn] = acc[mn];
    }

    homebridge.registerPlatform("homebridge-globalcache-itach", "GlobalCacheItach", ItachPlatform);
    //homebridge.registerAccessory("homebridge-globalcache-itach", "GlobalCacheItach", ItachAccessory);
}

function ItachPlatform(log, config) {
    this.log = log;
    this.devices = config.devices;
}

ItachPlatform.prototype.errors = {
    "001": "Invalid command. Command not found.",
    "002": "Invalid module address (does not exist).",
    "003": "Invalid connector address (does not exist).",
    "004": "Invalid ID value.",
    "005": "Invalid frequency value.",
    "006": "Invalid repeat value.",
    "007": "Invalid offset value.",
    "008": "Invalid pulse count.",
    "009": "Invalid pulse data.",
    "010": "Uneven amount of on off statements.",
    "011": "No carriage return found.",
    "012": "Repeat count exceeded.",
    "013": "IR command sent to input connector.",
    "014": "Blaster command sent to non-blaster connector.",
    "015": "No carriage return before buffer full.",
    "016": "No carriage return.",
    "017": "Bad command syntax.",
    "018": "Sensor command sent to non-input connector.",
    "019": "Repeated IR transmission failure.",
    "020": "Above designated IR on off pair limit.",
    "021": "Symbol odd boundary.",
    "022": "Undefined symbol.",
    "023": "Unknown option.",
    "024": "Invalid baud rate setting.",
    "025": "Invalid flow control setting.",
    "026": "Invalid parity setting.",
    "027": "Settings are locked."
};

ItachAccessory.prototype.errors = ItachPlatform.prototype.errors;

ItachPlatform.prototype.accessories = function (callback) {
    if (Array.isArray(this.devices)) {
        var devicesProcessed = 0;
        for (var l = 0; l < this.devices.length; l++) {
            if (this.devices[l].enableLearnLogging) {
                this.sendSocketCommand(l, 'get_IRL', function (index, result) {
                }, true);
            }
            var results = [];
            this.sendSocketCommand(l, 'getdevices', function (index, result) {
                var currentDeviceConfig = this.devices[index];
                var ports = result.split('\r');
                if (ports.length > 2) {
                    for (var i = 1; i < ports.length - 2; i++) {
                        var portDetails = ports[i].split(',');
                        if (portDetails.length != 3) {
                            this.log("Can't handle iTach port: " + ports[i]);
                            continue;
                        }
                        var portCountAndType = portDetails[2].split(' ');
                        if (portCountAndType.length != 2) {
                            this.log("Can't handle iTach device subtype: " + portDetails[2]);
                            continue;
                        }
                        var portCount = parseInt(portCountAndType[0].trim());
                        var portType = portCountAndType[1].toLowerCase().trim();
                        this.log('Found ' + portCount + ' ' + portType + " ports.");
                        for (var j = 0; j < portCount; j++) {
                            var disable = false;
                            if (currentDeviceConfig.ports && currentDeviceConfig.ports.length > j) {
                                disable = currentDeviceConfig.ports[j].disable;
                            }
                            if (!disable) {
                                results.push(new ItachAccessory(this.log, portType, currentDeviceConfig, j));
                            }
                        }

                    }
                    devicesProcessed++;
                    if (devicesProcessed == this.devices.length) {
                        if (results.length == 0) {
                            this.log("WARNING: No Accessories were loaded.");
                        }
                        callback(results);
                    }
                } else {
                    throw new Error("Unexpected response in fetching devices from itach: " + result);
                }
            }.bind(this));
        }
    }
}

/* Global Cache Accessories
 CC
 */
function ItachAccessory(log, deviceType, config, portIndex) {
    this.log = log;
    var portConfig = null;
    if (config.ports && config.ports.length > portIndex) {
        portConfig = config.ports[portIndex];
    }
    this.name = config.name + " - " + (portIndex + 1);
    this.deviceType = deviceType;
    this.host = config.host;
    this.port = config.port;
    this.portIndex = portIndex;
    this.log("Configuring iTach accessory.  Name: " + this.name + ", Type: " + this.deviceType + " at port: " + this.portIndex);
    this.toggleMode = false;
    this.isIrSwitch = false;
    this.commands = {};

    var id = uuid.generate('itach.' + deviceType + "." + this.host + "." + portIndex);
    Accessory.call(this, this.name, id);
    this.uuid_base = id;

    if (portConfig) {
        this.name = portConfig.name ? portConfig.name : this.name;
        this.toggleMode = portConfig.toggleMode;
    }

    this.services = [];
    if (this.deviceType == "relay") {
        var service = null;
        if (this.toggleMode) {
            service = new Service.GarageDoorOpener(this.name);
            service
                .getCharacteristic(Characteristic.TargetDoorState)
                .on('get', this.getState.bind(this))
                .on('set', this.setState.bind(this));
            service.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSED);
        } else {
            service = new Service.Switch(this.name);
            service
                .getCharacteristic(Characteristic.On)
                .on('get', this.getState.bind(this))
                .on('set', this.setState.bind(this));
        }
        this.services.push(service);
    } else if (this.deviceType == "ir") {
        this.commands = config.ports[portIndex].commands;
        if (this.commands && this.commands.on && this.commands.off) {
            //Assume default to off.
            this.irState = Characteristic.Off;
            this.isIrSwitch = true;
            var service = new Service.Switch(this.name);
            service.subtype = "default";
            service
                .getCharacteristic(Characteristic.On)
                .on('set', this.setState.bind(this))
                .on('get', this.getState.bind(this));
            this.services.push(service);
        }
        for (var i = 0; i < Object.keys(this.commands).length; i++) {
            var command = Object.keys(this.commands)[i];
            if (command == "on" || command == "off") {
                continue;
            }
            var service = new Service.Switch(command);
            service.subtype = command;
            service.getCharacteristic(Characteristic.On)
                .on('set', this.setIrState.bind(this, command))
                .on('get', this.getState.bind(this));
            this.services.push(service);
        }

    } else {
        throw new Error("Unsupported device type: " + this.deviceType);
    }
}

ItachAccessory.prototype.getServices = function () {
    return this.services;
}

ItachAccessory.prototype.setIrState = function (command, state, callback) {
    this.log("Setting IR state for command: " + command);

    var commandArray = this.commands[command];
    this.irState = false; //Aways false.

    if(typeof commandArray === 'string') {
        commandKeys = [command];
    } else {
        commandKeys = commandArray.slice(0, commandArray.length);
    }
    commandKeys.reverse();
    this.doNextCall(commandKeys, function() {
        console.log("Finished all commands");
        callback(null, state);
    }.bind(this));

}

ItachAccessory.prototype.doNextCall = function(commandKeys, callback) {
    var self = this;
    var commandKey = commandKeys.pop();
    var command = self.commands[commandKey] ? self.commands[commandKey] : commandKey;
    this.setState(command, function (error, state) {
        if (commandKeys.length == 0) {
            callback();
        } else {
            self.doNextCall(commandKeys, callback);
        }
    });
}

ItachAccessory.prototype.setState = function (state, callback) {
    var command = "setstate";
    if (this.deviceType == "ir") {
        command = "sendir";
    }
    command += (",1:" + (this.portIndex + 1) + ",");

    if (this.deviceType == "ir") {
        if (this.isIrSwitch) {
            command += state ? this.commands.on : this.commands.off;
        } else {
            command += state;
        }
    } else {
        command += (this.toggleMode || state ? '1' : '0');
    }
    this.sendSocketCommand(command, function (data) {
        var expected = command.trim();
        if (this.deviceType == "ir") {
            expected = "completeir" + command.substring(6, 12);
        }
        if (data.trim() == expected) {
            if (this.toggleMode) {
                setTimeout(function () {
                    var command = "setstate,1:" + (this.portIndex + 1) + ",0";
                    this.sendSocketCommand(command, function (data) {
                        if (data.trim() == command.trim()) {
                            callback(null);
                        }
                    });
                }.bind(this), 1000);
            } else {
                if (this.deviceType == "ir") {
                    this.irState = state;
                    callback(null, this.irState);
                } else {
                    callback(null);
                }

            }
        } else {
            callback(new Error('Failed to set state to ' + state + ".  Response: " + data));
        }

    }.bind(this));
}

/* TODO
 */
ItachAccessory.prototype.getState = function (callback) {
    if (this.deviceType == "ir") {
        callback(null, this.irState);
        return;

    }
    if (this.toggleMode) {
        //No way to determine current state in toggle mode.
        callback(null, "Unknown");
        return;
    }
    var command = "getstate,1:" + (this.portIndex + 1) + '\r';
    this.sendSocketCommand(command, function (data) {
        var dataSplit = data.split(',');
        if (dataSplit.length != 3) {
            callback(new Error("Unexpected response from device: " + data));
        } else {
            callback(null, dataSplit[2].trim() == '1');
        }
    }.bind(this));
}

ItachPlatform.prototype.sendSocketCommand = function (deviceIndex, command, callback, persistent) {
    var device = this.devices[deviceIndex];
    var host = device.host;
    var port = device.port ? device.port : 4998;
    var sock = new net.Socket();
    sock.log = this.log;
    var self = this;

    sock.connect(port, host, function () {
        this.log('Connected to ' + this.localAddress + ':' + this.localPort + ".  Sending command: " + command);
        this.write(command + "\r");
    }).on('data', function (data) {
        this.log('DATA: ' + data);
        callback(deviceIndex, data.toString());
        // Close the connection if not persistent
        if (!persistent) {
            sock.destroy();
        }
    });
}

ItachAccessory.prototype.sendSocketCommand = function (command, callback) {
    var host = this.host;
    var port = this.port ? this.port : 4998;
    var sock = new net.Socket(); // A socket to communicate to the GC100 with
    sock.log = this.log; // Make it possible to use the platform log from the net.Socket instance
    var self = this;

    sock.connect(port, host, function () {
        this.log('Connected to ' + this.remoteAddress + ':' + this.remotePort + ".  Sending command: " + command);
        this.write(command + "\r");
    }).on('data', function (data) {
        var result = data.toString()
        this.log('DATA: ' + result);
        if (result.substring(0, 3) == "ERR") {
            var code = result.split(',')[1].trim();
            var message = self.errors[code];
            this.log("An error has occurred. " + code + ": " + message);
        }
        callback(result);
        // Close the connection
        this.destroy();
    });
}