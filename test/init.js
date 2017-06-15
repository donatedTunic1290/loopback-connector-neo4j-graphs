var DataSource = require("loopback-datasource-juggler").DataSource;
var config = {
    "host": process.env.TEST_NEO4J_HOST || "localhost",
    "port": process.env.TEST_NEO4J_PORT || 7474,
    "username": process.env.TEST_NEO4J_USER || "neo4j",
    "password": process.env.TEST_NEO4J_PASS || "neo4j",
    "enterprise": false
};

global.config = config;

/**
 * Get data source.
 */
global.getDataSource = function (customConfig) {
    "use strict";
    var db = new DataSource(require("../"), customConfig || config);

    /**
     * Log function.
     *
     * @param {*} a - data to log
     */
    db.log = function (a) {
        console.log(a);
    };

    return db;
};

global.sinon = require("sinon");

module.exports = require("should");
