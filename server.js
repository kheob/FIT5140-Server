/**
 * Application that starts the Raspberry Pi and the express server
 *
 * Author: Bai Chan Kheo
 */

var five = require('johnny-five'); // Source: http://johnny-five.io/
var raspi = require('raspi-io'); // Source: https://github.com/nebrius/raspi-io
var express = require('express'); // Source: https://expressjs.com/
var mosca = require('mosca'); // Source: http://www.mosca.io/

// Create a new board object passing in the raspi
var board = new five.Board({
    io: new raspi()
});

// New Mosca MQTT server
var mqtt = new mosca.Server({
    port: 1883
});

board.on('ready', function() {
    // Create new object for the barometric sensor
    var multi = new five.Multi({
        controller: "MPL3115A2",
        elevation: 23 // Elevation from http://www.whatismyelevation.com
    });

    // Add values to the start of an array every time it updates
    var barometerValues = [];
    multi.on('change', function() {
        var values = {
            "temperature": multi.thermometer.celsius,
            "pressure": multi.barometer.pressure,
            "altitude": multi.altimeter.meters
        };

        // Stores date as ISO string
        var date = new Date().toISOString();

        // JSON object with date as key
        var entry = {};
        entry["date"] = date;
        entry["values"] = values;

        barometerValues.unshift(entry);

        // Publish values on the MQTT server
        var message = {
            topic: '/barometer',
            payload: JSON.stringify(values),
            qos: 0,
            retain: false
        };

        mqtt.publish(message, function() {
        });
    });

    // Configure server routes
    var app = express();

    /**
     * barometric sensor routes
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
            res.json(barometerValues[0]);
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
                res.json({
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
                res.json({
                    "error": "Please ensure that you use the correct date format: e.g. '2011-12-20T14:48:00'"
                });
            }
        }

        else {
            res.json({
                "error": "Error reading parameters. Use either 'count' to specify the number of updates to retrieve, or 'startDate' and 'endDate' to specify the period of the updates to be returned."
            });
        }

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
