var Service;
var Characteristic;

var https = require('https'),
    assign = require('object-assign');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.hap.Accessory;

    homebridge.registerAccessory('homebridge-tado', 'TADO', TadoAccessory);
}


function TadoAccessory(log, config) {
    var accessory = this;
    this.log = log;

    this.name = config['name'];
    this.homeID = config['homeID'];
    this.username = config['username'];
    this.password = config['password'];
	this.zone = config['zone'];
    this.useFahrenheit = config['useFahrenheit'];

    this.targetTemp = 0;
    this.zoneType = "UNKNOWN";
}

TadoAccessory.prototype.getServices = function() {
    var minValue = 5;
    var maxValue = 25;

    if (this.useFahrenheit) {
        minValue = 40;
        maxValue = 80;
    }

    this.log("Minimum setpoint " + minValue);
    this.log("Maximum setpoint " + maxValue);

    this.targetTemp = minValue;


    var informationService = new Service.AccessoryInformation()
        .setCharacteristic(Characteristic.Manufacturer, 'Tado GmbH')
        .setCharacteristic(Characteristic.Model, 'Tado Smart Heating / AC Control')
        .setCharacteristic(Characteristic.SerialNumber, 'Tado Serial Number');

    this.service = new Service.Thermostat(this.name);
        
    this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', this.getCurrentHeatingCoolingState.bind(this));

    this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('get', this.getTargetHeatingCoolingState.bind(this))
        .on('set', this.setTargetHeatingCoolingState.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
            minValue: 0,
            maxValue: 100,
            minStep: 0.01
        })
        .on('get', this.getCurrentTemperature.bind(this));

    this.service.getCharacteristic(Characteristic.TargetTemperature)
        .setProps({
            minValue: minValue,
            maxValue: maxValue,
            minStep: 1
        })
        .on('get', this.getTargetTemperature.bind(this))
        .on('set', this.setTargetTemperature.bind(this));

    this.service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
        .on('get', this.getTemperatureDisplayUnits.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .setProps({
            minValue: 0,
            maxValue: 100,
            minStep: 0.01
        })
        .on('get', this.getCurrentRelativeHumidity.bind(this));

    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({
            minValue: minValue,
            maxValue: maxValue,
            minStep: 1
        });

    this.service.addCharacteristic(Characteristic.On);
    this.service.getCharacteristic(Characteristic.On)
        .on('set', this.setTargetHeatingCoolingState.bind(this));

    return [this.service];
}

TadoAccessory.prototype.getCurrentHeatingCoolingState = function(callback) {
    var accessory = this;

    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);
            accessory.log("Current zone type is " + obj.setting.type);
            accessory.log("Current power state is " + obj.setting.power);

            accessory.zoneType = obj.setting.type;

            if (obj.setting.temperature != null) {
                if (accessory.useFahrenheit) {
                    accessory.log("Target temperature is " + obj.setting.temperature.fahrenheit + "ºF");
                    accessory.targetTemp = obj.setting.temperature.fahrenheit;
                } else {
                    accessory.log("Target temperature is " + obj.setting.temperature.celsius + "ºC");
                    accessory.targetTemp = obj.setting.temperature.celsius;
                }
            }

            if (JSON.stringify(obj.setting.power).match("OFF")) {
                accessory.log("Current operating state is OFF");
                 
                callback(null, Characteristic.CurrentHeatingCoolingState.OFF);
            } else {
                accessory.log("Current operating state is " + obj.setting.type);
                 
                if (JSON.stringify(obj.setting.type).match("HEATING")) {
                    callback(null, Characteristic.CurrentHeatingCoolingState.HEAT);            
                } else {
                    callback(null, Characteristic.CurrentHeatingCoolingState.COOL);
                }
            }
        });
    });
}

TadoAccessory.prototype.getTargetHeatingCoolingState = function(callback) {
    var accessory = this;

    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);

            if (obj.setting.temperature != null) {
                if (accessory.useFahrenheit) {
                    accessory.log("Target temperature is " + obj.setting.temperature.fahrenheit + "ºF");
                    accessory.targetTemp = obj.setting.temperature.fahrenheit;
                } else {
                    accessory.log("Target temperature is " + obj.setting.temperature.celsius + "ºC");
                    accessory.targetTemp = obj.setting.temperature.celsius;
                }
            }

            if (obj.overlay == null) {
                accessory.log("Target operating state is AUTO");
                 
                callback(null, Characteristic.TargetHeatingCoolingState.AUTO);
            } else {
                if (JSON.stringify(obj.overlay.setting.power).match("OFF")) {
                    accessory.log("Target operating state is OFF");
                    
                    callback(null, Characteristic.TargetHeatingCoolingState.OFF);
                } else {
                    accessory.log("Target operating state is " + obj.overlay.setting.type);
                    
                    if (JSON.stringify(obj.overlay.setting.type).match("HEATING")) {
                        callback(null, Characteristic.TargetHeatingCoolingState.HEAT);
                    } else {
                        callback(null, Characteristic.TargetHeatingCoolingState.COOL);
                    }
                }
            }
        });
    });
}

TadoAccessory.prototype.setTargetHeatingCoolingState = function(state, callback) {
    var accessory = this;

    switch (state) {
        case Characteristic.TargetHeatingCoolingState.OFF:
            accessory.log("Set target state to off");
 
            body = {
                "termination": {
                    "type": "TADO_MODE"
                },
                "setting": {
                    "power": "OFF"
                }
            };

            body.setting.type = accessory.zoneType;

            accessory._setOverlay(body);
            break;

        case Characteristic.TargetHeatingCoolingState.HEAT:
            accessory.log("Force heating");
 
            accessory._setTargetHeatingOverlay();
            break;

        case Characteristic.TargetHeatingCoolingState.COOL:
            accessory.log("Force cooling");
 
            accessory._setTargetCoolingOverlay();
            break;

        case Characteristic.TargetHeatingCoolingState.AUTO:
            accessory.log("Automatic control");

            accessory._setOverlay(null);
            break;
    }

    callback(null);
}

TadoAccessory.prototype.getCurrentTemperature = function(callback) {
    var accessory = this;

    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);

            if (accessory.useFahrenheit) {
                accessory.log("Room temperature is " + obj.sensorDataPoints.insideTemperature.fahrenheit + "ºF");
                callback(null, obj.sensorDataPoints.insideTemperature.fahrenheit);
            } else {
                accessory.log("Room temperature is " + obj.sensorDataPoints.insideTemperature.celsius + "ºC");
                callback(null, obj.sensorDataPoints.insideTemperature.celsius);
            }
        });
    });
}

TadoAccessory.prototype.getTargetTemperature = function(callback) {
    var accessory = this;

    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);

            if (obj.setting.temperature == null) {
                    accessory.log("Target temperature is unavailable");

                    callback(null, accessory.targetTemp);
                    return;
            }

            if (accessory.useFahrenheit) {
                    accessory.log("Target temperature is " + obj.setting.temperature.fahrenheit + "ºF");
                    accessory.targetTemp = obj.setting.temperature.fahrenheit;

                    callback(null, obj.setting.temperature.fahrenheit);
            } else {
                    accessory.log("Target temperature is " + obj.setting.temperature.celsius + "ºC");
                    accessory.targetTemp = obj.setting.temperature.celsius;

                    callback(null, obj.setting.temperature.celsius);
            }
        });
    });
}

TadoAccessory.prototype.setTargetTemperature = function(temp, callback) {
    var accessory = this;
    accessory.log("Set target temperature to " + temp + "º");
    accessory.targetTemp = temp;

    switch (accessory.zoneType) {
        case "AIR_CONDITIONING":
            accessory._setTargetCoolingOverlay();
            break;

        case "HEATING":
            accessory._setTargetHeatingOverlay();
            break;
    }

    callback(null);
}

TadoAccessory.prototype.getTemperatureDisplayUnits = function(callback) {
    var accessory = this;
    accessory.log("The current temperature display unit is " + (accessory.useFahrenheit ? "ºF" : "ºC"));
    callback(null, accessory.useFahrenheit ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS);
}

TadoAccessory.prototype.getCurrentRelativeHumidity = function(callback) {
    var accessory = this;

    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);
            accessory.log("Humidity is " + obj.sensorDataPoints.humidity.percentage + "%");
            callback(null, obj.sensorDataPoints.humidity.percentage);
        });
    });
}


TadoAccessory.prototype._getCurrentStateResponse = function(callback) {
    accessory = this;
    accessory.log("Getting target state");

    var options = {
        host: 'my.tado.com',
        path: '/api/v2/homes/' + accessory.homeID + '/zones/' + accessory.zone + '/state?username=' + accessory.username + '&password=' + accessory.password
    };

    https.request(options, callback).end();
}

TadoAccessory.prototype._setOverlay = function(body) {
    accessory = this;
    accessory.log("Setting new overlay");
    
    var options = {
        host: 'my.tado.com',
        path: '/api/v2/homes/' + accessory.homeID + '/zones/' + accessory.zone + '/overlay?username=' + accessory.username + '&password=' + accessory.password,
        method: body == null ? 'DELETE' : 'PUT'
    };
    
    if (body != null) {
        body = JSON.stringify(body);
    }

    https.request(options, null).end(body);
}

TadoAccessory.prototype._setTargetCoolingOverlay = function() {
    body = {
        "termination": {
            "type": "TADO_MODE"
        },
        "setting": {
            "power": "ON",
            "type": "AIR_CONDITIONING",
            "swing": "ON",
            "fanSpeed": "AUTO",
            "mode": "COOL",
            "temperature": {}
        }
    };

    if (this.useFahrenheit) {
        body.setting.temperature.fahrenheit = this.targetTemp;
    } else {
        body.setting.temperature.celsius = this.targetTemp;
    }

    this._setOverlay(body);
}

TadoAccessory.prototype._setTargetHeatingOverlay = function() {
    var body = {
        "termination": {
            "type": "TADO_MODE"
        },
        "setting": {
            "power": "ON",
            "type": "HEATING",
            "temperature": {}
        }
    };

    if (this.useFahrenheit) {
        body.setting.temperature.fahrenheit = this.targetTemp;
    } else {
        body.setting.temperature.celsius = this.targetTemp;
    }

    this._setOverlay(body);
}

