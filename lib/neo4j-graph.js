var neo4j = require("neo4j");
var util = require("util");
var Connector = require("loopback-connector").Connector;
var debug = require("debug")("loopback:connector:neo4j-graph");
var uuid = require("uuid");
var Promise = require("bluebird");

/**
 * Connector constructor.
 *
 * @param {Object} settings - the data source settings
 * @param {Object} dataSource - the data source
 * @constructor
 */
var Neo4j = function (settings, dataSource) {
    "use strict";
    settings.url = settings.url || this.generateUrl(settings);
    Connector.call(this, "neo4j-graph", settings);
    this.dataSource = dataSource;
    this.debug = settings.debug || debug.enabled;

    if (this.debug) {
        debug("Constructor:settings: %j", settings);
    }
    this.db = new neo4j.GraphDatabase({
        "url": settings.url,
        "auth": settings.auth || null, // optional; see below for more details
        "headers": settings.headers || {}, // optional defaults, e.g. User-Agent
        "proxy": settings.proxy || null, // optional URL
        "agent": settings.agent || null // optional http.Agent instance, for custom socket pooling
    });
};

/**
 * Initialize the neo4j connector for the given data source.
 *
 * @param {Object} dataSource - The data source instance
 * @param {Function} callback - The callback function
 */
exports.initialize = function (dataSource, callback) {
    "use strict";
    var settings = dataSource.settings || {};

    if (!neo4j) {
        return;
    }
    dataSource.connector = new Neo4j(settings, dataSource);
    if (callback) {
        callback();
    }
};

/**
 * Inherit the prototype methods
 */
util.inherits(Neo4j, Connector);

/**
 * Get ID name for a given model.
 *
 * @param {string} model - Model name
 * @returns {string}
 */
Neo4j.prototype.getIdName = function (model) {
    "use strict";
    return this.idName(model) || "id";
};

/**
 * Get label for a given model.
 *
 * @param {string} model - Model name
 * @returns {string}
 */
Neo4j.prototype.label = function (model) {
    "use strict";
    var modelClass = this.getModelDefinition(model);

    if (modelClass.settings.neo4j) {
        model = modelClass.settings.neo4j.label || model;
    }
    return model;
};

/**
 * Generate the neo4j URL.
 *
 * @param {Object} settings - the data source settings
 * @returns {string}
 */
Neo4j.prototype.generateUrl = function (settings) {
    "use strict";
    var username = settings.username || settings.user;

    if (this.debug) {
        debug("generateUrl");
    }
    settings.hostname = settings.hostname || settings.host || "127.0.0.1";
    settings.port = settings.port || 7474;
    if (username && settings.password) {
        return "http://" + username + ":" + settings.password + "@" + settings.hostname + ":" + settings.port;
    } else {
        return "http://" + settings.hostname + ":" + settings.port;
    }
};

/**
 * Convert the data from database to JSON.
 *
 * @param {string} model - The model name
 * @param {Object} data - The data from DB
 */
Neo4j.prototype.fromDatabase = function (model, data) {
    "use strict";
    var self = this,
        dateFields = {
            "created": 1,
            "lastUpdated": 1
        },
        dateObject = {},
        properties = self.getModelDefinition(model).properties,
        propertyNames = Object.keys(properties);

    if (self.debug) {
        debug("fromDatabase:model:%s,data:%j", model, data);
    }
    if (!data) {
        return null;
    }
    propertyNames.forEach(function (p) {
        var prop = properties[p];

        if (self.debug) {
            debug("fromDatabase:p:%s,prop:%j", p, prop);
        }
        if (data[p]) {
            if (self.debug) {
                debug("fromDatabase:value present:%s", p);
            }
            if (dateFields[p]) {
                // We need to convert date strings to date since Neo4j doesn't support date type
                // at the time of writing this.
                if (self.debug) {
                    debug("fromDatabase:date field");
                }
                try {
                    dateObject = new Date(data[p]);
                    data[p] = dateObject;
                } catch (e) {
                    if (self.debug) {
                        debug("fromDatabase:date exception2:%j", e);
                    }
                }
            } else if (prop.type) {
                if (self.debug) {
                    debug("fromDatabase:property type:%j", prop.type);
                }
                // We need to convert date strings to date since Neo4j doesn't support date type
                // at the time of writing this.
                if ("Date" === prop.type) {
                    if (self.debug) {
                        debug("fromDatabase:date type");
                    }
                    try {
                        dateObject = new Date(data[p]);
                        data[p] = dateObject;
                    } catch (e) {
                        if (self.debug) {
                            debug("fromDatabase:date exception1:%j", e);
                        }
                    }
                }
            }
        }
    });
    return data;
};

/**
 * Build where condition.
 *
 * @param {Object} where - the where conditions
 * @returns {Object}
 */
Neo4j.prototype.buildWhere = function (where) {
    "use strict";
    var self = this,
        logicalOperators = { // nor not supported directly in Neo4j, so not supported now
            "and": 1,
            "or": 1,
            "not": 1,
            "xor": 1
        },
        conditions = [],
        cypher = {
            "query": "",
            "params": {}
        },
        queries = [],
        spec = "";

    if (null === where || "object" !== typeof where) {
        return cypher;
    }
    Object.keys(where).forEach(function (k) {
        var cond = where[k],
            valueAnchor1 = k + uuid.v4().replace(/-/g, ""),
            valueAnchor2 = "",
            i = 0,
            length = 0,
            query = "";

        if (logicalOperators[k]) {
            if (Array.isArray(cond) && cond.length) {
                cond = cond.map(function (c) {
                    return self.buildWhere(c);
                });
                queries = cond.map(function (entry) {
                    Object.keys(entry.params).forEach(function (key) {
                        cypher.params[key] = entry.params[key];
                    });
                    return entry.query;
                });
                conditions.push(" (" + queries.join(" " + k.toUpperCase()) + ")");
            }
        } else {
            if (cond && "Object" === cond.constructor.name) {
                spec = Object.keys(cond)[0];
                cond = cond[spec];
                if (spec) {
                    if (self.debug) {
                        debug("buildWhere:spec:%s,cond:%j", spec, cond);
                    }
                    switch (spec) {
                        case "gt":
                            conditions.push(" n." + k + " > {" + valueAnchor1 + "}");
                            cypher.params[valueAnchor1] = cond;
                            break;
                        case "gte":
                            conditions.push(" n." + k + " >= {" + valueAnchor1 + "}");
                            cypher.params[valueAnchor1] = cond;
                            break;
                        case "lt":
                            conditions.push(" n." + k + " < {" + valueAnchor1 + "}");
                            cypher.params[valueAnchor1] = cond;
                            break;
                        case "lte":
                            conditions.push(" n." + k + " <= {" + valueAnchor1 + "}");
                            cypher.params[valueAnchor1] = cond;
                            break;
                        case "between":
                            valueAnchor2 = k + uuid.v4().replace(/-/g, "");
                            conditions.push(" (n." + k + " > {" + valueAnchor1 + "} AND n." + k + " < {" + valueAnchor2 + "})");
                            cypher.params[valueAnchor1] = cond[0];
                            cypher.params[valueAnchor2] = cond[1];
                            break;
                        case "inq":
                            query = " n." + k + " IN [";
                            length = cond.length;
                            for (i = 0; i < length; i += 1) {
                                if (i > 0) {
                                    query += ", ";
                                }
                                valueAnchor2 = valueAnchor1 + i;
                                query += "{" + valueAnchor2 + "}";
                                cypher.params[valueAnchor2] = cond[i];
                            }
                            query += "]";
                            conditions.push(query);
                            break;
                        case "nin":
                            query = " n." + k + " NOT IN [";
                            length = cond.length;
                            for (i = 0; i < length; i += 1) {
                                if (i > 0) {
                                    query += ", ";
                                }
                                valueAnchor2 = valueAnchor1 + i;
                                query += "{" + valueAnchor2 + "}";
                                cypher.params[valueAnchor2] = cond[i];
                            }
                            query += "]";
                            conditions.push(query);
                            break;
                        case "near":
                            // not supported now
                            break;
                        case "neq":
                            conditions.push(" NOT n." + k + " = {" + valueAnchor1 + "}");
                            cypher.params[valueAnchor1] = cond;
                            break;
                        case "like":
                            conditions.push(" n." + k + " =~ {" + valueAnchor1 + "}");
                            cypher.params[valueAnchor1] = ".*" + cond + ".*";
                            break;
                        case "nlike":
                            conditions.push(" NOT n." + k + " =~ {" + valueAnchor1 + "}");
                            cypher.params[valueAnchor1] = ".*" + cond + ".*";
                            break;
                        case "regexp":
                            // not supported now because Neo4j doesn't support real regular expressions
                            break;
                    }
                } else {
                    if (null === cond) {
                        conditions.push(" n." + k + " IS NULL");
                    } else {
                        conditions.push(" n." + k + " = {" + valueAnchor1 + "}");
                        cypher.params[valueAnchor1] = cond;
                    }
                }
            } else {
                conditions.push(" n." + k + " = {" + valueAnchor1 + "}");
                cypher.params[valueAnchor1] = cond;
            }
        }
    });
    cypher.query = conditions.join(" AND");
    return cypher;
};

/**
 * Build sort statement.
 *
 * @param {Object} order - the sort order
 * @returns {string}
 */
Neo4j.prototype.buildSort = function (order) {
    "use strict";
    var sortQuery = "",
        keys = {},
        index = 0,
        len = 0,
        m = [],
        key = "";

    if (order) {
        keys = order;
        if ("string" === typeof keys) {
            keys = keys.split(",");
        }
        len = keys.length;
        for (index = 0; index < len; index += 1) {
            m = keys[index].match(/\s+(A|DE)SC$/);
            key = keys[index].replace(/\s+(A|DE)SC$/, "").trim();
            if (index > 0) {
                sortQuery += ",";
            }
            if (m && "DE" === m[1]) {
                sortQuery = " n." + key + " DESC";
            } else {
                sortQuery = " n." + key;
            }
        }
    }
    return sortQuery;
};

/**
 * Return connector type.
 *
 * @returns {Array}
 */
Neo4j.prototype.getTypes = function () {
    "use strict";
    if (this.debug) {
        debug("getTypes");
    }
    return ["db", "nosql", "graph", "neo4j", this.name];
};

/**
 * Ping the server.
 *
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.ping = function (callback) {
    "use strict";
    var self = this;

    if (self.debug) {
        debug("ping");
    }
    self.db.http({
        "method": "GET",
        "path": "/db/data"
    }, function (error, response) {
        if (self.debug) {
            debug("ping:error:%j,response:%j", error, response);
        }
        if (callback) {
            if (error) {
                callback(error);
            } else {
                callback(null, true);
            }
        }
    });
};

/**
 * Create a new model instance for the given data.
 *
 * @param {string} model - The model name
 * @param {Object} data - The model data
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.create = function (model, data, options, callback) {
    "use strict";
    var self = this,
        idName = self.getIdName(model);

    if (self.debug) {
        debug("create:model:%s,data:%j,options:%j", model, data, options);
    }
    // always inject id if it's not present in data
    if (!data[idName]) {
        data[idName] = uuid.v4();
    }
    self.db.cypher({
        "query": "CREATE (n:" + self.label(model) + " {properties})",
        "params": {
            "properties": data
        }
    }, function (error, response) {
        if (self.debug) {
            debug("create:error:%j,response:%j", error, response);
        }
        if (callback) {
            callback(error, data[idName]);
        }
    });
};

/**
 * Save (update) the model instance for the given data.
 * Save with given properties overwriting existing ones.
 *
 * @param {string} model - The model name
 * @param {Object} data - The model data
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.save = function (model, data, options, callback) {
    "use strict";
    var self = this,
        idName = self.getIdName(model),
        params = {};

    if (self.debug) {
        debug("save:model:%s,data:%j,options:%j", model, data, options);
    }
    // always inject id if it's not present in data
    if (!data[idName]) {
        data[idName] = uuid.v4();
    }
    params[idName] = data[idName];
    params.properties = data;
    self.db.cypher({
        "query": "MERGE (n:" + self.label(model) + " {" + idName + ": {id}}) ON CREATE SET n = {properties} ON MATCH SET n = {properties} RETURN n",
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("save:error:%j,response:%j", error, response);
        }
        response = self.fromDatabase(model, response);
        if (callback) {
            callback(error, response);
        }
    });
};

/**
 * Update if the model instance exists with the same id or create a new instance.
 * Update adds new properties without removing existing ones.
 *
 * @param {string} model - The model name
 * @param {Object} data - The model instance data
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.updateOrCreate = function (model, data, options, callback) {
    "use strict";
    var self = this,
        idName = self.getIdName(model),
        params = {};

    if (self.debug) {
        debug("updateOrCreate:model:%s,id:%j,options:%j", model, data, options);
    }
    // always inject id if it's not present in data
    if (!data[idName]) {
        data[idName] = uuid.v4();
    }
    params[idName] = data[idName];
    params.properties = data;
    self.db.cypher({
        "query": "MERGE (n:" + self.label(model) + " {" + idName + ": {id}}) ON CREATE SET n = {properties} ON MATCH SET n += {properties} RETURN n",
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("updateOrCreate:error:%j,response:%j", error, response);
        }
        response = self.fromDatabase(model, response[0].n.properties);
        if (callback) {
            callback(error, response);
        }
    });
};

/**
 * Check if a model instance exists by id.
 *
 * @param {string} model - The model name
 * @param {*} id - The id value
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 *
 */
Neo4j.prototype.exists = function (model, id, options, callback) {
    "use strict";
    var self = this,
        idName = self.getIdName(model),
        params = {};

    if (self.debug) {
        debug("exists:model:%s,id:%j,options:%j", model, id, options);
    }
    params[idName] = id;
    params.idName = idName;
    self.db.cypher({
        "query": "MATCH (n:" + self.label(model) + " {" + idName + ": {id}}) RETURN n.{idName}",
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("exists:error:%j,response:%j", error, response);
        }
        if (callback) {
            callback(error, !!response);
        }
    });
};

/**
 * Find a model instance by id.
 *
 * @param {string} model - The model name
 * @param {*} id - The id value
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.find = function (model, id, options, callback) {
    "use strict";
    var self = this,
        idName = self.getIdName(model),
        params = {};

    if (self.debug) {
        debug("find:model:%s,id:%j,options:%j", model, id, options);
    }
    params[idName] = id;
    self.db.cypher({
        "query": "MATCH (n:" + self.label(model) + " {" + idName + ": {id}}) RETURN n",
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("find:error:%j,response:%j", error, response);
        }
        response = self.fromDatabase(model, response);
        if (callback) {
            callback(error, response);
        }
    });
};

/**
 * Find one matching model instance by the filter.
 *
 * @param {string} model - The model name
 * @param {Object} filter - The filter
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.findOne = function (model, filter, options, callback) {
    "use strict";
    var self = this,
        query = "MATCH (n:" + self.label(model) + ")",
        params = {},
        where = {},
        fields = [],
        data = [];

    if (self.debug) {
        debug("findOne:model:%s,filter:%j,options:%j", model, filter, options);
    }
    filter = filter || {};
    if (filter.where) {
        where = self.buildWhere(filter.where);
        if (self.debug) {
            debug("findOne:where:%j", where);
        }
        if (where.query) {
            query += " WHERE" + where.query;
            params = where.params;
        }
    }
    query += " RETURN n";
    if (filter.fields) {
        if ("string" === typeof filter.fields) {
            fields = filter.fields.split(",");
        } else if (Array.isArray(filter.fields)) {
            fields = filter.fields;
        } else {
            // Object
            fields = Object.keys(filter.fields).filter(function (key) {
                return filter.fields[key];
            });
        }
        query += "." + fields.join(", n.");
    }
    query += " LIMIT 1";
    if (self.debug) {
        debug("findOne:query:%s", query);
    }
    self.db.cypher({
        "query": query,
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("findOne:error:%j,response:%j", error, response);
        }
        if (response) {
            data = response.map(function (entry) {
                return self.fromDatabase(model, entry.n.properties);
            });
            if (self.debug) {
                debug("findOne:data:%j", data);
            }
        }
        if (callback) {
            callback(error, data);
        }
    });
};

/**
 * Find a matching model instances by the filter or create a new instance.
 *
 * @param {string} model - The model name
 * @param {Object} filter - The filter
 * @param {Object} data - The model instance data
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.findOrCreate = function (model, filter, data, callback) {
    "use strict";
    var self = this,
        idName = self.getIdName(model);

    if (self.debug) {
        debug("findOrCreate:model:%s,filter:%j,data:%j", model, filter, data);
    }
    self.findOne(model, filter, {}, function (error, response) {
        if (self.debug) {
            debug("findOrCreate:error:%j,response:%j", error, response);
        }
        if (error) {
            if (callback) {
                callback(error);
            }
        } else if (response.length) {
            response = self.fromDatabase(model, response[0]);
            if (callback) {
                callback(error, response);
            }
        } else {
            self.create(model, data, {}, function (error, response) {
                if (self.debug) {
                    debug("findOrCreate:error1:%j,response1:%j", error, response);
                }
                if (callback) {
                    if (error) {
                        callback(error);
                    } else {
                        if (!data[idName]) {
                            data[idName] = response;
                        }
                        callback(error, data);
                    }
                }
            });
        }
    });
};

/**
 * Delete a model instance by id.
 * NOTE: deleting a node will delete all it's relations as well.
 * If the existence of relations need to be caught, execute delete cypher query manually.
 *
 * @param {string} model - The model name
 * @param {*} id - The id value
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.destroy = function (model, id, options, callback) {
    "use strict";
    var self = this,
        idName = self.getIdName(model),
        params = {};

    if (self.debug) {
        debug("destroy:model:%s,id:%j,options:%j", model, id, options);
    }
    params[idName] = id;
    self.db.cypher({
        "query": "MATCH (n:" + self.label(model) + " {" + idName + ": {id}}) DETACH DELETE n",
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("destroy:error:%j,response:%j", error, response);
        }
        if (callback) {
            callback(error, response);
        }
    });
};

/**
 * Find matching model instances by the filter.
 * TODO: include filter.
 *
 * @param {string} model - The model name
 * @param {Object} filter - The filter
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.all = function (model, filter, options, callback) {
    "use strict";
    var self = this,
        query = "MATCH (n:" + self.label(model) + ")",
        params = {},
        where = {},
        order = "",
        fields = [],
        data = [];

    if (self.debug) {
        debug("all:model:%s,filter:%j,options:%j", model, filter, options);
    }
    filter = filter || {};
    if (filter.where) {
        where = self.buildWhere(filter.where);
        if (self.debug) {
            debug("all:where:%j", where);
        }
        if (where.query) {
            query += " WHERE" + where.query;
            params = where.params;
        }
    }
    query += " RETURN n";
    if (filter.fields) {
        if ("string" === typeof filter.fields) {
            fields = filter.fields.split(",");
        } else if (Array.isArray(filter.fields)) {
            fields = filter.fields;
        } else {
            // Object
            fields = Object.keys(filter.fields).filter(function (key) {
                return filter.fields[key];
            });
        }
        fields = fields.map(function (field) {
            return field + " AS " + field;
        });
        query += "." + fields.join(", n.");
    }
    if (filter.order) {
        order = self.buildSort(filter.order);
        query += " ORDER BY" + order;
    }
    if (filter.skip) {
        query += " SKIP {skip}";
        params.skip = filter.skip;
    }
    if (filter.limit) {
        query += " LIMIT {limit}";
        params.limit = filter.limit;
    }
    if (self.debug) {
        debug("all:query:%s", query);
    }
    self.db.cypher({
        "query": query,
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("all:error:%j,response:%j", error, response);
        }
        if (response) {
            if (filter.fields) {
                data = response.map(function (entry) {
                    return self.fromDatabase(model, entry);
                });
            } else {
                data = response.map(function (entry) {
                    return self.fromDatabase(model, entry.n.properties);
                });
            }
            if (self.debug) {
                debug("all:data:%j", data);
            }
        }
        if(filter && filter.include) {
            self.getModelDefinition(model).model.include(
                data, filter.include, options, callback);
        } else {
            if (callback) {
                callback(error, data);
            }
        }
    });
};

/**
 * Delete all instances for the given model.
 *
 * @param {string} model - The model name
 * @param {Object} where - The where conditions
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.destroyAll = function (model, where, options, callback) {
    "use strict";
    var self = this,
        query = "MATCH (n:" + self.label(model) + ")",
        params = {},
        cypher = {};

    if (self.debug) {
        debug("destroyAll:model:%s,where:%j,options:%j", model, where, options);
    }
    if (where) {
        cypher = self.buildWhere(where);
        if (self.debug) {
            debug("destroyAll:where:%j", cypher);
        }
        if (cypher.query) {
            query += " WHERE" + cypher.query;
            params = cypher.params;
        }
    }
    query += " DETACH DELETE n RETURN COUNT(n) AS count";
    if (self.debug) {
        debug("all:query:%s", query);
    }
    self.db.cypher({
        "query": query,
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("destroyAll:error:%j,response:%j", error, response);
        }
        if (callback) {
            callback(error, response[0]);
        }
    });
};

/**
 * Count the number of instances for the given model.
 *
 * @param {string} model - The model name
 * @param {Object} where - The where conditions
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 *
 */
Neo4j.prototype.count = function (model, where, options, callback) {
    "use strict";
    var self = this,
        query = "MATCH (n:" + self.label(model) + ")",
        params = {},
        cypher = {};

    if (self.debug) {
        debug("count:model:%s,where:%j,options:%j", model, where, options);
    }
    if (where) {
        cypher = self.buildWhere(where);
        if (self.debug) {
            debug("count:where:%j", cypher);
        }
        if (cypher.query) {
            query += " WHERE" + cypher.query;
            params = cypher.params;
        }
    }
    query += " RETURN COUNT(n) AS count";
    self.db.cypher({
        "query": query,
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("count:error:%j,response:%j", error, response);
        }
        if (callback) {
            callback(error, response[0].count);
        }
    });
};

/**
 * Update properties for the model instance data.
 *
 * @param {string} model - The model name
 * @param {*} id - The id value
 * @param {Object} data - The model data
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.updateAttributes = function (model, id, data, options, callback) {
    "use strict";
    var self = this,
        idName = self.getIdName(model),
        params = {};

    if (self.debug) {
        debug("updateAttributes:model:%s,id:%j,data:%j,options:%j", model, id, data, options);
    }
    params[idName] = id;
    params.properties = data;
    self.db.cypher({
        "query": "MATCH (n:" + self.label(model) + " {" + idName + ": {id}}) SET n += {properties}",
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("updateAttributes:error:%j,response:%j", error, response);
        }
        if (callback) {
            callback(error, response);
        }
    });
};

/**
 * Update all matching instances.
 *
 * @param {string} model - The model name
 * @param {Object} where - The search criteria
 * @param {Object} data - The property/value pairs to be updated
 * @param {Object} options - The model options
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.updateAll = function (model, where, data, options, callback) {
    "use strict";
    var self = this,
        query = "MATCH (n:" + self.label(model) + ")",
        params = {},
        cypher = {};

    if (self.debug) {
        debug("updateAll:model:%s,where:%j,data:%j,options:%j", model, where, data, options);
    }
    if (where) {
        cypher = self.buildWhere(where);
        if (self.debug) {
            debug("updateAll:where:%j", cypher);
        }
        if (cypher.query) {
            query += " WHERE" + cypher.query;
            params = cypher.params;
        }
    }
    query += " SET n += {properties} RETURN COUNT(n) AS count";
    params.properties = data;
    self.db.cypher({
        "query": query,
        "params": params
    }, function (error, response) {
        if (self.debug) {
            debug("updateAll:error:%j,response:%j", error, response);
        }
        if (callback) {
            callback(error, response[0]);
        }
    });
};

Neo4j.prototype.update = Neo4j.prototype.updateAll;

/**
 * Execute cypher queries.
 *
 * @param {String|Object} command - The cypher query
 * @param {*[]} params - An array of parameter values (unused)
 * @param {Object} options - the options
 * @param {Function} callback - the callback function
 */
Neo4j.prototype.execute = function (command, params, options, callback) {
    "use strict";
    var self = this,
        cypher = {};
    if ("string" === typeof command) {
        cypher.query = command;
    } else {
        cypher = command;
    }
    if ("function" === typeof params) {
        callback = params;
    }

    if (self.debug) {
        debug("execute:cypher:%j", cypher);
    }
    return this.db.cypher(cypher, callback, options && options.tx ? options.tx : undefined);
};

/**
 * Begin a transaction. Returns the Neo4j transaction object.
 * Note that this is not an implementation of native loopback transactions,
 * just a wrapper for using Neo4j transactions.
 *
 * @returns {Object}
 */
Neo4j.prototype.startTransaction = function () {
    "use strict";
    return this.db.beginTransaction();
};

/**
 * Perform auto update for the given models. It basically calls CREATE INDEX.
 *
 * @param {*} models - A model name or an array of model names or callback function if models is skipped. If not
 * present, apply to all models
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.autoupdate = function (models, callback) {
    "use strict";
    var self = this,
        queries = [];

    if (self.debug) {
        debug("autoupdate:models:%j", models);
    }
    if (!callback && "function" === typeof models) {
        callback = models;
        models = undefined;
    }
    // First argument is a model name
    if ("string" === typeof models) {
        models = [models];
    }

    models = models || Object.keys(self._models);
    models.forEach(function (model) {
        var indexes = self.getModelDefinition(model).settings.indexes || [],
            properties = self.getModelDefinition(model).properties,
            idName = self.getIdName(model),
            indexNames = [],
            index = {},
            keyList = [],
            indexProperties = {},
            uniqueProperties = {},
            existProperties = {},
            propertyNames = Object.keys(properties),
            indexPropertiesArray = [],
            uniquePropertiesArray = [],
            existPropertiesArray = [];

        // Always ensure ID is unique
        uniqueProperties[idName] = 1;
        // Always ensure ID property exists
        existProperties[idName] = 1;

        // Get model global indexes
        if ("object" === typeof indexes) {
            indexNames = Object.keys(indexes);
            indexNames.forEach(function (indexName) {
                index = indexes[indexName];
                if (index.keys) {
                    keyList = Object.keys(index.keys);
                    if (1 === keyList.length) {
                        if (index.options && index.options.unique) {
                            // Creating constraint will also create index, so we don't need to create index separately.
                            uniqueProperties[keyList[0]] = 1;
                        } else {
                            indexProperties[keyList[0]] = 1;
                        }
                    } else if (keyList.length) {
                        // Note that composite key unique constraints are not supported in Neo4j
                        // at the time of writing this.
                        keyList.forEach(function (key) {
                            indexProperties[key] = 1;
                        });
                    }
                } else {
                    keyList = Object.keys(index);
                    if (keyList.length) {
                        keyList.forEach(function (key) {
                            indexProperties[key] = 1;
                        });
                    }
                }
            });
        } else if (Array.isArray(indexes)) {
            indexes.forEach(function (key) {
                indexProperties[key] = 1;
            });
        }

        // Get property local indexes
        propertyNames.forEach(function (p) {
            if (properties[p].index) {
                if ("object" === typeof properties[p].index && properties[p].index.unique) {
                    // Creating constraint will also create index, so we don't need to create index separately.
                    uniqueProperties[p] = 1;
                } else {
                    indexProperties[p] = 1;
                }
            }
        });

        if (self.debug) {
            debug("autoupdate:indexes,unique,exist(%s): %j, %j, %j", model, indexProperties, uniqueProperties, existProperties);
        }

        uniquePropertiesArray = Object.keys(uniqueProperties);
        if (uniquePropertiesArray.length) {
            uniquePropertiesArray.forEach(function (property) {
                queries.push({
                    "query": "CREATE CONSTRAINT ON (n:" + self.label(model) + ") ASSERT n." + property + " IS UNIQUE"
                });
            });
        }

        indexPropertiesArray = Object.keys(indexProperties);
        if (indexPropertiesArray.length) {
            indexPropertiesArray.forEach(function (property) {
                queries.push({
                    "query": "CREATE INDEX ON :" + self.label(model) + "(" + property + ")"
                });
            });
        }

        // Property existence constraint requires Neo4j Enterprise Edition
        if (self.settings.enterprise) {
            existPropertiesArray = Object.keys(existProperties);
            if (existPropertiesArray.length) {
                existPropertiesArray.forEach(function (property) {
                    queries.push({
                        "query": "CREATE CONSTRAINT ON (n:" + self.label(model) + ") ASSERT EXISTS(n." + property + ")"
                    });
                });
            }
        }
    });

    if (queries.length) {
        if (self.debug) {
            debug("autoupdate:queries: %j", queries);
        }
        self.db.cypher({
            "queries": queries
        }, function (error, response) {
            if (self.debug) {
                debug("autoupdate:error:%j,response:%j", error, response);
            }
            if (callback) {
                callback(error, response);
            }
        });
    }
};

/**
 * Perform auto migrate for the given models. It drops all existing indexes and calls auto update.
 *
 * @param {*} models - A model name or an array of model names. If not present, apply to all models
 * @param {Function} callback - The callback function
 */
Neo4j.prototype.automigrate = function (models, callback) {
    "use strict";
    var self = this,
        labels = {},
        neo4jHttp = Promise.promisify(self.db.http, {
            "context": self.db
        }),
        neo4jCypher = Promise.promisify(self.db.cypher, {
            "context": self.db
        });

    if (self.debug) {
        debug("automigrate:models:%j", models);
    }
    if (!callback && "function" === typeof models) {
        callback = models;
        models = undefined;
    }
    // First argument is a model name
    if ("string" === typeof models) {
        models = [models];
    }

    models = models || Object.keys(self._models);
    models.forEach(function (model) {
        labels[self.label(model)] = 1;
    });
    neo4jHttp({
        "method": "GET",
        "path": "/db/data/schema/constraint"
    })
        .then(function (response) {
            var queries = [];

            if (self.debug) {
                debug("automigrate:response:%j", response);
            }
            // Drop uniqueness constraints first, because indexes created by those cannot be dropped directly
            response.forEach(function (entry) {
                /* jscs:disable requireCamelCaseOrUpperCaseIdentifiers */
                if ("UNIQUENESS" === entry.type && labels[entry.label]) {
                    // Note that composite key unique constraints are not supported in Neo4j
                    // at the time of writing this.
                    queries.push({
                        "query": "DROP CONSTRAINT ON (n:" + entry.label + ") ASSERT n." + entry.property_keys[0] + " IS UNIQUE"
                    });
                }
                /* jscs:enable requireCamelCaseOrUpperCaseIdentifiers */
            });
            if (queries.length) {
                if (self.debug) {
                    debug("automigrate:queries1: %j", queries);
                }
                return neo4jCypher({
                    "queries": queries
                })
                    .then(function (response) {
                        if (self.debug) {
                            debug("automigrate:response1:%j", response);
                        }
                    });
            }
        })
        .then(function () {
            return neo4jHttp({
                "method": "GET",
                "path": "/db/data/schema/index"
            });
        })
        .then(function (response) {
            var queries = [];

            if (self.debug) {
                debug("automigrate:response2:%j", response);
            }
            response.forEach(function (entry) {
                /* jscs:disable requireCamelCaseOrUpperCaseIdentifiers */
                if (labels[entry.label]) {
                    // Note that composite key indexes are not supported in Neo4j
                    // at the time of writing this.
                    queries.push({
                        "query": "DROP INDEX ON :" + entry.label + "(" + entry.property_keys[0] + ")"
                    });
                }
                /* jscs:enable requireCamelCaseOrUpperCaseIdentifiers */
            });
            if (queries.length) {
                if (self.debug) {
                    debug("automigrate:queries3: %j", queries);
                }
                return neo4jCypher({
                    "queries": queries
                });
            }
        })
        .then(function (response) {
            if (self.debug) {
                debug("automigrate:response3:%j", response);
            }
            self.autoupdate(models, callback);
        })
        .catch(function (error) {
            if (self.debug) {
                debug("automigrate:error:%j", error);
            }
            if (callback) {
                callback(error);
            }
        });
};
