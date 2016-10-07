/**
 * Application that starts the Raspberry Pi and the express server
 *
 * Author: Bai Chan Kheo
 */

var five = require('johnny-five'); // Source: http://johnny-five.io/
var raspi = require('raspi-io'); // Source: https://github.com/nebrius/raspi-io
var express = require('express'); // Source: https://expressjs.com/
var mosca = require('mosca'); // Source: http://www.mosca.io/
var i2c = require('i2c'); // Source: https://github.com/kelly/node-i2c
var publicip = require('public-ip'); // Source: https://github.com/sindresorhus/public-ip

// Create a new board object passing in the raspi
var board = new five.Board({
    io: new raspi()
});

// New Mosca MQTT server
var mqtt = new mosca.Server({
    port: 1883
});

// RGB sensor variables
// Source: Matthew Kairys
var address = 0x29;
var version = 0x44;
var rgbSensor = new i2c(address, {device: '/dev/i2c-1'});

// Wait for the board to ready
board.on('ready', function() {
    // Create new object for the barometric sensor
    var multi = new five.Multi({
        controller: "MPL3115A2",
        elevation: 23 // Elevation from http://www.whatismyelevation.com
    });

    // Start the RGB sensor
    rgbSensor.writeByte(0x80|0x12, function(err){});
    rgbSensor.readByte(function(err, res) {
        if(res == version) {
            setup();
        }
    });

    // Add values to the start of an array every time it updates
    var barometerValues = [];
    var rgbValues = [];
    multi.on('change', function() {
        var values = {
            "temperature": multi.thermometer.celsius,
            "pressure": multi.barometer.pressure,
            "altitude": multi.altimeter.meters
        };

        // Stores date as ISO string
        var date = new Date().toISOString();

        // JSON object with date as key for barometer readings
        var entry = {};
        entry["date"] = date;
        entry["values"] = values;

        barometerValues.unshift(entry);

        // Max size of array is 100 000 readings to help with memory issues
        if (barometerValues.length > 100000) {
            barometerValues.pop();
        }

        // Publish values on the MQTT server
        var message = {
            topic: '/barometer',
            payload: JSON.stringify(values),
            qos: 0,
            retain: false
        };
        mqtt.publish(message, function() {
        });

        /**
         * RGB
         */

        // Add RGB values to array
        captureColour(function(rgb) {
            var rgbEntry = {};
            rgbEntry["date"] = date;
            rgbEntry["values"] = rgb;
            rgbValues.unshift(rgbEntry);

            // Max size of array is 100 000 readings to help with memory issues
            if (rgbValues.length > 100000) {
                rgbValues.pop();
            }

            // Publish values on the MQTT server
            var rgbMessage = {
                topic: '/rgb',
                payload: JSON.stringify(rgb),
                qos: 0,
                retain: false
            };
            mqtt.publish(rgbMessage, function() {
            });
        });
    });

    // Configure server routes
    var app = express();

    // Homepage shows API doc
    // API doc generated with Swagger: http://swagger.io/
    // HTML file generated with bootprint-openapi: https://github.com/bootprint/bootprint-openapi
    app.get('/', function(req, res) {
        res.sendFile(__dirname + '/static/index.html');
    });

    /**
     * Barometric sensor routes
     */

    // Returns the current values of the barometric sensor
    app.get('/barometer', function(req, res) {
        // Get query params
        var count = req.query.count;
        var startDate = req.query.startDate;
        var endDate = req.query.endDate;

        // If no values currently, return error message
        if (barometerValues.length === 0) {
            res.json({
                "error": "Can't read values from the sensor. Please try again later."
            });
        }

        // Return current values if no params given
        else if (Object.keys(req.query).length === 0) {
            res.json([barometerValues[0]]);
        }

        // Return last N updates if a count is given
        else if (count != null && Object.keys(req.query).length === 1) {
            // Try to parse
            count = parseInt(count);

            if (!isNaN(count)) {
                // Try to get the last N updates
                if (count > barometerValues.length) {
                    // Not enough updates
                    var output = {
                        "error": "You requested " + count + " updates, but the system only has " + barometerValues.length + " updates stored. Please try again later.",
                        "updates": barometerValues
                    };

                    res.json(output);
                } else {
                    res.json(barometerValues.slice(0, count));
                }
            } else {
                // Couldn't parse count value, return error
                res.status(400).json({
                    "error": "Count parameter must be a valid integer value."
                });
            }
        }

        // Return updates within the given start and end dates
        else if (startDate != null && endDate != null && Object.keys(req.query).length === 2) {
            // Check if correct date format has been inputted
            // Adapted from: http://stackoverflow.com/a/24989586/6601606
            if (!isNaN(Date.parse(startDate)) && !isNaN(Date.parse(endDate))) {
                // Get date from query (ISO-8601 format: e.g. 2011-10-10T14:48:00)
                var offset = "+" + Math.abs(new Date().getTimezoneOffset() / 60 * 100); // Offset for local time

                startDate = new Date(startDate + offset);
                endDate = new Date(endDate + offset);

                // Get the values between the two dates
                var retrievedUpdates = [];

                // Retrieve the updates that fall between these two dates
                for (var i in barometerValues) {
                    var entry = barometerValues[i];

                    // Turn into date object
                    var date = new Date(entry["date"]);

                    // Check if it lies between the start and end dates
                    if (date >= startDate && date <= endDate) {
                        retrievedUpdates.push(entry);
                    }
                }

                // Return the updates
                res.json(retrievedUpdates);
            } else {
                res.status(400).json({
                    "error": "Please ensure that you use the correct date format: e.g. '2011-12-20T14:48:00'"
                });
            }
        }

        else {
            res.status(400).json({
                "error": "Error reading parameters. Use either 'count' to specify the number of updates to retrieve, or 'startDate' and 'endDate' to specify the period of the updates to be returned."
            });
        }

    });

    /**
     * RGB sensor routes
     */

    app.get('/rgb', function(req, res) {
        // Get query params
        var count = req.query.count;
        var startDate = req.query.startDate;
        var endDate = req.query.endDate;

        // If no values currently, return error message
        if (rgbValues.length === 0) {
            res.json({
                "error": "Can't read values from the sensor. Please try again later."
            });
        }

        // Return current values if no params given
        else if (Object.keys(req.query).length === 0) {
            res.json([rgbValues[0]]);
        }

        // Return last N updates if a count is given
        else if (count != null && Object.keys(req.query).length === 1) {
            // Try to parse
            count = parseInt(count);

            if (!isNaN(count)) {
                // Try to get the last N updates
                if (count > rgbValues.length) {
                    // Not enough updates
                    var output = {
                        "error": "You requested " + count + " updates, but the system only has " + rgbValues.length + " updates stored. Please try again later.",
                        "updates": rgbValues
                    };

                    res.json(output);
                } else {
                    res.json(rgbValues.slice(0, count));
                }
            } else {
                // Couldn't parse count value, return error
                res.status(400).json({
                    "error": "Count parameter must be a valid integer value."
                });
            }
        }

        // Return updates within the given start and end dates
        else if (startDate != null && endDate != null && Object.keys(req.query).length === 2) {
            // Check if correct date format has been inputted
            // Adapted from: http://stackoverflow.com/a/24989586/6601606
            if (!isNaN(Date.parse(startDate)) && !isNaN(Date.parse(endDate))) {
                // Get date from query (ISO-8601 format: e.g. 2011-10-10T14:48:00)
                var offset = "+" + Math.abs(new Date().getTimezoneOffset() / 60 * 100); // Offset for local time

                startDate = new Date(startDate + offset);
                endDate = new Date(endDate + offset);

                // Get the values between the two dates
                var retrievedUpdates = [];

                // Retrieve the updates that fall between these two dates
                for (var i in rgbValues) {
                    var entry = rgbValues[i];

                    // Turn into date object
                    var date = new Date(entry["date"]);

                    // Check if it lies between the start and end dates
                    if (date >= startDate && date <= endDate) {
                        retrievedUpdates.push(entry);
                    }
                }

                // Return the updates
                res.json(retrievedUpdates);
            } else {
                res.status(400).json({
                    "error": "Please ensure that you use the correct date format: e.g. '2011-12-20T14:48:00'"
                });
            }
        }

        else {
            res.status(400).json({
                "error": "Error reading parameters. Use either 'count' to specify the number of updates to retrieve, or 'startDate' and 'endDate' to specify the period of the updates to be returned."
            });
        }

    });

    // Get public ip address
    publicip.v4().then(ip => {
        console.log('Public IP address is ', ip);
    });

    // Start the server
    app.listen(3000, function() {
        console.log("HTTP Server listening on port 3000...");
    });



    /**
     * MQTT
     */

    mqtt.on('clientConnected', function(client) {
        console.log('client connected', client.id);
    });

    // fired when a message is received
    mqtt.on('published', function(packet, client) {
    });

    mqtt.on('ready', function() {
        console.log("MQTT server listening on port 1883...");
    });
});

/**
 * RGB sensor functions
 *
 * Author: Matthew Kairys
 */

function setup() {
    // Enable register
    rgbSensor.writeByte(0x80|0x00, function(err){});

    // Power on and enable RGB sensor
    rgbSensor.writeByte(0x01|0x02, function(err){});

    // Read results from Register 14 where data values are stored
    // See TCS34725 Datasheet for breakdown
    rgbSensor.writeByte(0x80|0x14, function(err){});
}

// Captures the current value on the RGB sensor and returns as a hex value
function captureColour(callback) {
    // Read colours and convert to 16 bit number
    rgbSensor.read(8, function(err, res) {
        var clear = res[1] << 8 | res[0];
        var red = res[2] << 8 | res[3];
        var green = res[5] << 8 | res[4];
        var blue = res[7] << 8 | res[6];

        // Convert to 8 bit number
        // Divide by clear to normalize Source: https://www.hackster.io/windows-iot/what-color-is-it-578fdb
        red = Math.round((red / clear) * 255);
        green = Math.round((green / clear) * 255);
        blue = Math.round((blue / clear) * 255);

        var rgb = {
            "red": red,
            "green": green,
            "blue": blue
        };

        callback(rgb);
    });
}