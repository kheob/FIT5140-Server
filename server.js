/**
 * Application that starts the Raspberry Pi and the express server
 *
 * Author: Bai Chan Kheo
 */

var five = require('johnny-five'); // Source: http://johnny-five.io/
var raspi = require('raspi-io'); // Source: https://github.com/nebrius/raspi-io
var express = require('express'); // Source: https://expressjs.com/

// Create a new board object passing in the raspi
var board = new five.Board({
    io: new raspi()
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
        entry[date] = values;

        barometerValues.unshift(entry);
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
            // Get date from query (ISO-8601 format: e.g. 2011-10-10T14:48:00)
            startDate = new Date(startDate);
            endDate = new Date(endDate);

            console.log(startDate.toLocaleDateString());

            // Check if correct date format has been inputted
            if (startDate != null && endDate != null) {
                // Get the values between the two dates

            } else {
                res.json({
                    "error": "Please ensure that you use the correct date format: e.g. '2011-12-20T14:48:00'"
                });
            }
        }

    });

    // Start the server
    app.listen(3000, function() {
        console.log("Server listening on port 3000...");
    });
});
