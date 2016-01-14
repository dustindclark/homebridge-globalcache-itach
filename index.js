var net = require("net");
var Service, Characteristic;
var inherits = require('util').inherits;

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

ItachPlatform.prototype.accessories = function (callback) {
    if (Array.isArray(this.devices)) {
        for (var l = 0; l < this.devices.length; l++) {
            var currentDeviceConfig = this.devices[l];
            this.sendSocketCommand(currentDeviceConfig.host, (currentDeviceConfig.port ? currentDeviceConfig.port : 4998), 'getdevices', function (result) {
                var results = [];
                var devices = result.split('\r');
                if (devices.length > 2) {
                    for (var i = 1; i < devices.length - 2; i++) {
                        var deviceDetails = devices[i].split(',');
                        if (deviceDetails.length != 3) {
                            this.log("Can't handle iTach device: " + devices[i]);
                            continue;
                        }
                        var deviceCountAndType = deviceDetails[2].split(' ');
                        if (deviceCountAndType.length != 2) {
                            this.log("Can't handle iTach device subtype: " + deviceDetails[2]);
                            continue;
                        }
                        var deviceCount = parseInt(deviceCountAndType[0].trim());
                        var deviceType = deviceCountAndType[1].toLowerCase().trim();
                        this.log('Found ' + deviceCount + ' ' + deviceType + " devices.");
                        for (var j = 0; j < deviceCount; j++) {
                            var disable = false;
                            if (currentDeviceConfig.outputs && currentDeviceConfig.outputs.length > j) {
                                disable = currentDeviceConfig.outputs[j].disable;
                            }
                            if (! disable) {
                                results.push(new ItachAccessory(this.log, deviceType, j, currentDeviceConfig));
                            }
                        }

                    }
                    if (results.length == 0) {
                        this.log("WARNING: No Accessories were loaded.");
                    }
                    callback(results);
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
function ItachAccessory(log, deviceType, deviceIndex, config) {
    this.log = log;
    this.name = config.name + " - " + (deviceIndex + 1);
    this.host = config.host;
    this.port = (config.port ? config.port : 4998);
    this.deviceType = deviceType;
    this.deviceIndex = deviceIndex;
    this.log("Configuring iTach accessory.  Name: " + this.name + ", Host: " + this.host + ", port: " + this.port);

    var id = uuid.generate('itach.' + deviceType + "." + deviceIndex);
    Accessory.call(this, this.name, id);
    this.uuid_base = id;

    if (config.outputs && config.outputs.length > deviceIndex) {
        this.name = config.outputs[deviceIndex].name ? config.outputs[deviceIndex].name : this.name;
        this.log("Set name to " + this.name);
    }

    this.services = null; // will hold the services this accessory supports
    if (this.deviceType == "relay") {
        var aService = new Service.Switch(this.name);
        aService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getState.bind(this))
            .on('set', this.setState.bind(this));
        this.service = aService;
    } else {
        throw new Error("Unsupported device type: " + this.deviceType);
    }
}

ItachAccessory.prototype.getServices = function () {
    return [this.service];
}

ItachAccessory.prototype.setState = function (state, callback) {
    var command = "setstate,1:" + (this.deviceIndex + 1) + "," + (state ? '1' : '0');
    this.executeCommand(command, function (data) {
        if(data.trim() == command.trim()) {
            this.log("Successfully updated state");
            callback(null);
        } else {
            this.log("Failed t update state");
            callback(new Error('Failed to set state to ' + state + ".  Response: " + data));
        }

    }.bind(this));
}

/* TODO
 */
ItachAccessory.prototype.getState = function (callback) {
    var command = "getstate,1:" + (this.deviceIndex + 1) + '\r';
    this.executeCommand(command, function (data) {
        var dataSplit = data.split(',');
        if (dataSplit.length != 3) {
            callback(new Error("Unexpected response from device: " + data));
        } else {
            callback(null, dataSplit[2].trim() == '1');
        }
    }.bind(this));
}

ItachAccessory.prototype.executeCommand = function (command, callback) {
    this.sendSocketCommand(this.host, this.port, command, callback);
}

ItachPlatform.prototype.sendSocketCommand = function (host, port, command, callback) {
    var sock = new net.Socket(); // A socket to communicate to the GC100 with
    sock.log = this.log; // Make it possible to use the platform log from the net.Socket instance
    var self = this;

    sock.connect(port, host, function () {
        this.log('Connected to ' + this.localAddress + ':' + this.localPort + ".  Sending command: " + command);
        // Send the IR command to the GC100
        this.write(command + "\r");
    }).on('data', function (data) {
        // log the response from the GC100
        self.log('DATA: ' + data);
        callback(data.toString());
        // Close the connection
        this.destroy();
    });
}
ItachAccessory.prototype.sendSocketCommand = ItachPlatform.prototype.sendSocketCommand;