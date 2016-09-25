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

    console.log("Server starting");

    multi.on('change', function() {
        console.log("Temp: ", this.thermometer.celsius, " Pressure: ", this.barometer.pressure, " Altitude: ", this.altimeter.meters);
    });
});
