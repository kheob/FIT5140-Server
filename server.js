var five = require('johnny-five');
var raspio = require('raspi-io');
var express = require('express');

var board = new five.Board({
    io: new raspio()
});

board.on('ready', function() {
    var multi = new five.Multi({
        controller: "MPL3115A2",
        elevation: 23
    });

    console.log("Hello!");

    console.log("Server starting");

    multi.on('change', function() {
        console.log("Temp: ", this.thermometer.celsius, " Pressure: ", this.barometer.pressure, " Altitude: ", this.altimeter.meters);
    });

    var app = express();

    app.get('/', function(req, res) {
        var board = {
            "temp": multi.thermometer.celsius,
            "pressure": multi.barometer.pressure,
            "altitude": multi.altimeter.meters
        }

        res.send(board);
    });

    app.listen(3000, function() {
        console.log("Server listening on port 3000");
    });
});
