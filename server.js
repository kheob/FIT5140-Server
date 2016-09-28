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

    // Add values to an array every time it updates
    var barometerValues = [];
    multi.on('change', function() {
        var values = {
            "temperature": multi.thermometer.celsius,
            "pressure": multi.barometer.pressure,
            "altitude": multi.altimeter.meters
        };

        barometerValues.push(values);
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

        // Return current values if no params given
        if (Object.keys(req.query).length == 0) {
            res.json(barometerValues[barometerValues.length - 1]);
        }

        // Return last N results if a count is given
        else if (count != null) {
            // Try to parse
            count = parseInt(count);
            res.json(count);
        }

        // var values = {
        //     "temperature": multi.thermometer.celsius,
        //     "pressure": multi.barometer.pressure,
        //     "altitude": multi.altimeter.meters
        // };
        //
        // res.json(values);
    });

    // Start the server
    app.listen(3000, function() {
        console.log("Server listening on port 3000...");
    });
});
