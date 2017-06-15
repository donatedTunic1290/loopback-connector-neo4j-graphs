describe("neo4j-graph imported features", function () {
    "use strict";
    before(function () {
        require("./init.js");
    });

    require("loopback-datasource-juggler/test/common.batch.js");
    require("loopback-datasource-juggler/test/default-scope.test.js");
    require("loopback-datasource-juggler/test/include.test.js");
});
