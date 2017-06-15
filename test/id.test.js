var ds = {};

require("./init.js");
ds = getDataSource();

describe("neo4j-graph custom id name", function () {
    "use strict";
    var Customer = ds.createModel("customer", {
        "seq": {
            "type": Number,
            "id": true
        },
        "name": String,
        "emails": [String],
        "age": Number
    });

    before(function (done) {
        Customer.deleteAll(done);
    });

    it("should allow custom name for the id property for create", function (done) {
        Customer.create({
            "seq": 1,
            "name": "John1",
            "emails": ["john@x.com", "john@y.com"],
            "age": 30
        }, function (err, customer) {
            customer.seq.should.equal(1);
            Customer.create({
                "seq": 2,
                "name": "John2",
                "emails": ["john2@x.com", "john2@y.com"],
                "age": 40
            }, function (err, customer) {
                customer.seq.should.equal(2);
                done(err, customer);
            });
        });
    });

    it("should allow custom name for the id property for findById", function (done) {
        Customer.findById(1, function (err, customer) {
            customer.seq.should.equal(1);
            done(err, customer);
        });
    });

    it("should allow inq with find", function (done) {
        Customer.find({
            "where": {
                "seq": {
                    "inq": [1]
                }
            }
        }, function (err, customers) {
            customers.length.should.equal(1);
            customers[0].seq.should.equal(1);
            done(err);
        });
    });

    after(function (done) {
        Customer.deleteAll(done);
    });
});

describe("neo4j-graph string id", function () {
    "use strict";
    var Customer = ds.createModel("customer2", {
        "seq": {
            "type": String,
            "id": true
        },
        "name": String,
        "emails": [String],
        "age": Number
    });

    before(function (done) {
        Customer.deleteAll(done);
    });

    it("should allow custom name for the id property for create", function (done) {
        Customer.create({
            "seq": "1",
            "name": "John1",
            "emails": ["john@x.com", "john@y.com"],
            "age": 30
        }, function (err, customer) {
            customer.seq.should.equal("1");
            done(err, customer);
        });
    });

    it("should allow custom name for the id property for findById", function (done) {
        Customer.findById(1, function (err, customer) {
            customer.seq.should.equal("1");
            done(err, customer);
        });
    });

    it("should allow inq with find", function (done) {
        Customer.find({
            "where": {
                "seq": {
                    "inq": [1]
                }
            }
        }, function (err, customers) {
            customers.length.should.equal(1);
            customers[0].seq.should.equal("1");
            done(err);
        });
    });

    after(function (done) {
        Customer.deleteAll(done);
    });
});

describe("neo4j-graph default id type", function () {
    "use strict";
    var Account = ds.createModel("account", {
            "seq": {
                "id": true,
                "generated": true
            },
            "name": String,
            "emails": [String],
            "age": Number
        }),
        id;

    before(function (done) {
        Account.deleteAll(done);
    });

    it("should generate id value for create", function (done) {
        Account.create({
            "name": "John1",
            "emails": ["john@x.com", "john@y.com"],
            "age": 30
        }, function (err, account) {
            if (err) {
                return done(err);
            }
            account.should.have.property("seq");
            id = account.seq;
            Account.findById(id, function (err, account1) {
                if (err) {
                    return done(err);
                }
                account1.seq.should.eql(account.seq);
                account.should.have.property("seq");
                done(err, account1);
            });
        });
    });

    it("should be able to find by string id", function (done) {
        // Try to look up using string
        Account.findById(id.toString(), function (err, account1) {
            if (err) {
                return done(err);
            }
            account1.seq.should.eql(id);
            done(err, account1);
        });
    });

    it("should be able to delete by string id", function (done) {
        // Try to look up using string
        Account.destroyById(id.toString(), function (err, info) {
            if (err) {
                return done(err);
            }
            info.count.should.eql(1);
            done(err);
        });
    });

    after(function (done) {
        Account.deleteAll(done);
    });
});

describe("neo4j-graph default id name", function () {
    "use strict";
    var Customer1 = ds.createModel("customer1", {
        "name": String,
        "emails": [String],
        "age": Number
    });

    before(function (done) {
        Customer1.deleteAll(done);
    });

    it("should allow value for the id property for create", function (done) {
        Customer1.create({
            "id": "1",
            "name": "John1",
            "emails": ["john@x.com", "john@y.com"],
            "age": 30
        }, function (err, customer) {
            // console.log(err, customer);
            customer.id.should.equal("1");
            done(err, customer);
        });
    });

    it("should allow value the id property for findById", function (done) {
        Customer1.findById("1", function (err, customer) {
            customer.id.should.equal("1");
            done(err, customer);
        });
    });

    it("should generate id value for create", function (done) {
        Customer1.create({
            "name": "John1",
            "emails": ["john@x.com", "john@y.com"],
            "age": 30
        }, function (err, customer) {
            // console.log(customer);
            customer.should.have.property("id");
            Customer1.findById(customer.id, function (err, customer1) {
                customer1.id.should.eql(customer.id);
                done(err, customer);
            });
        });
    });

    after(function (done) {
        Customer1.deleteAll(done);
    });
});
