// This test written in mocha+should.js
var should = require("./init.js");

var Superhero, User, Post, Product, PostWithStringId, PostWithNumberId, db;

describe("neo4j-graph connector", function () {
    "use strict";
    before(function () {
        db = getDataSource();

        User = db.define("User", {
            "name": {
                "type": String,
                "index": true
            },
            "email": {
                "type": String,
                "index": true,
                "unique": true
            },
            "age": Number
        }, {
            "indexes": {
                "name_age_index": {
                    "keys": {
                        "name": 1,
                        "age": -1
                    }
                }, // The value contains keys and optinally options
                "age_index": {
                    "age": -1
                } // The value itself is for keys
            }
        });

        Superhero = db.define("Superhero", {
            "name": {
                "type": String,
                "index": true
            },
            "power": {
                "type": String,
                "index": true,
                "unique": true
            },
            "address": {
                "type": String,
                "required": false,
                "index": {
                    "neo4j-graph": {
                        "unique": false,
                        "sparse": true
                    }
                }
            },
            "description": {
                "type": String,
                "required": false
            },
            "geometry": {
                "type": Object,
                "required": false,
                "index": {
                    "neo4j-graph": {
                        "kind": "2dsphere"
                    }
                }
            },
            "age": Number,
            "icon": Buffer
        }, {
            "neo4j-graph": {
                "label": "sh"
            }
        });

        Post = db.define("Post", {
            "title": {
                "type": String,
                "length": 255,
                "index": true
            },
            "content": {
                "type": String
            },
            "comments": [String]
        }, {
            "neo4j": {
                "label": "PostLabel" // Customize the label name
            }
        });

        Product = db.define("Product", {
            "name": {
                "type": String,
                "length": 255,
                "index": true
            },
            "description": {
                "type": String
            },
            "price": {
                "type": Number
            },
            "priceHistory": {
                "type": Object
            }
        }, {
            "neo4j": {
                "label": "ProductLabel" // Customize the label name
            }
        });

        PostWithStringId = db.define("PostWithStringId", {
            "id": {
                "type": String,
                "id": true
            },
            "title": {
                "type": String,
                "length": 255,
                "index": true
            },
            "content": {
                "type": String
            }
        });

        PostWithNumberId = db.define("PostWithNumberId", {
            "id": {
                "type": Number,
                "id": true
            },
            "title": {
                "type": String,
                "length": 255,
                "index": true
            },
            "content": {
                "type": String
            }
        });

        User.hasMany(Post);
        Post.belongsTo(User);
    });

    beforeEach(function (done) {
        User.settings.neo4j = {};
        User.destroyAll(function () {
            Post.destroyAll(function () {
                PostWithNumberId.destroyAll(function () {
                    PostWithStringId.destroyAll(done);
                });
            });
        });
    });

    describe(".ping(cb)", function () {
        it("should return true for valid connection", function (done) {
            db.ping(done);
        });

        it("should report connection errors", function (done) {
            var ds = getDataSource({
                "host": "localhost",
                "port": 4 // unassigned by IANA
            });

            ds.ping(function (err) {
                (!!err).should.be.true;
                err.message.should.match(/connect ECONNREFUSED/);
                done();
            });
        });
    });

    it("should create indexes", function (done) {
        db.automigrate("User", function () {
            db.connector.db.http({
                "method": "GET",
                "path": "/db/data/schema/index"
            }, function (error, response) {
                var indexes = response.filter(function (entry) {
                        return "User" === entry.label;
                    }),
                    indexedFields = indexes.map(function (entry) {
                        /* jscs:disable requireCamelCaseOrUpperCaseIdentifiers */
                        return entry.property_keys[0];
                        /* jscs:enable requireCamelCaseOrUpperCaseIdentifiers */
                    }).sort();

                indexedFields.should.eql(["age", "email", "id", "name"]);
                done(error, indexedFields);
            });
        });
    });

    it("hasMany should support additional conditions", function (done) {
        User.create(function (e, u) {
            u.posts.create({}, function (e, p) {
                u.posts({
                    "where": {
                        "id": p.id
                    }
                }, function (err, posts) {
                    // console.log(err, posts, u, p);
                    should.not.exist(err);
                    posts.should.have.lengthOf(1);
                    done();
                });
            });
        });
    });

    it("create should return id field but not neo4j _id", function (done) {
        Post.create({
            "title": "Post1",
            "content": "Post content"
        }, function (err, post) {
            // console.log("create should", err, post);
            should.not.exist(err);
            should.exist(post.id);
            should.not.exist(post._id);
            done();
        });
    });

    it("should allow to find by id string", function (done) {
        Post.create({
            "title": "Post1",
            "content": "Post content"
        }, function (err, post) {
            Post.findById(post.id.toString(), function (err, p) {
                should.not.exist(err);
                should.exist(p);
                done();
            });
        });
    });

    it("should allow custom label name", function (done) {
        Post.create({
            "title": "Post1",
            "content": "Post content"
        }, function (err, post) {
            Post.dataSource.connector.db.cypher({
                "query": "MATCH (n:PostLabel {id:{id}}) RETURN n",
                "params": {
                    "id": post.id
                }
            }, function (err, p) {
                // console.log("POST:", p[0].n.labels, p[0].n.properties);
                should.not.exist(err);
                p.should.have.lengthOf(1);
                done();
            });
        });
    });

    it("should allow to find by id using where", function (done) {
        Post.create({
            "title": "Post1",
            "content": "Post1 content"
        }, function (err, p1) {
            Post.create({
                "title": "Post2",
                "content": "Post2 content"
            }, function (err, p2) {
                // console.log(err, p2);
                Post.find({
                    "where": {
                        "id": p1.id
                    }
                }, function (err, p) {
                    should.not.exist(err);
                    should.exist(p && p[0]);
                    p.length.should.be.equal(1);
                    // Not strict equal
                    p[0].id.should.be.eql(p1.id);
                    done();
                });
            });
        });
    });

    it("should allow to find by id using where inq", function (done) {
        Post.create({
            "title": "Post1",
            "content": "Post1 content"
        }, function (err, p1) {
            Post.create({
                "title": "Post2",
                "content": "Post2 content"
            }, function (err, p2) {
                // console.log(err, p2);
                Post.find({
                    "where": {
                        "id": {
                            "inq": [p1.id]
                        }
                    }
                }, function (err, p) {
                    should.not.exist(err);
                    should.exist(p && p[0]);
                    p.length.should.be.equal(1);
                    // Not strict equal
                    p[0].id.should.be.eql(p1.id);
                    done();
                });
            });
        });
    });

    it("should allow to find by number id using where", function (done) {
        PostWithNumberId.create({
            "id": 1,
            "title": "Post1",
            "content": "Post1 content"
        }, function (err, p1) {
            PostWithNumberId.create({
                "id": 2,
                "title": "Post2",
                "content": "Post2 content"
            }, function (err, p2) {
                // console.log(err, p2);
                PostWithNumberId.find({
                    "where": {
                        "id": p1.id
                    }
                }, function (err, p) {
                    should.not.exist(err);
                    should.exist(p && p[0]);
                    p.length.should.be.equal(1);
                    p[0].id.should.be.eql(p1.id);
                    done();
                });
            });
        });
    });

    it("should allow to find by number id using where inq", function (done) {
        PostWithNumberId.create({
            "id": 1,
            "title": "Post1",
            "content": "Post1 content"
        }, function (err, p1) {
            PostWithNumberId.create({
                "id": 2,
                "title": "Post2",
                "content": "Post2 content"
            }, function (err, p2) {
                PostWithNumberId.find({
                    "where": {
                        "id": {
                            "inq": [1]
                        }
                    }
                }, function (err, p) {
                    should.not.exist(err);
                    should.exist(p && p[0]);
                    p.length.should.be.equal(1);
                    p[0].id.should.be.eql(p1.id);
                    PostWithNumberId.find({
                        "where": {
                            "id": {
                                "inq": [1, 2]
                            }
                        }
                    }, function (err, p) {
                        should.not.exist(err);
                        p.length.should.be.equal(2);
                        p[0].id.should.be.eql(p1.id);
                        p[1].id.should.be.eql(p2.id);
                        PostWithNumberId.find({
                            "where": {
                                "id": {
                                    "inq": [0]
                                }
                            }
                        }, function (err, p) {
                            should.not.exist(err);
                            p.length.should.be.equal(0);
                            done();
                        });
                    });
                });
            });
        });
    });

    it("save should not return neo4j _id", function (done) {
        Post.create({
            "title": "Post1",
            "content": "Post content"
        }, function (err, post) {
            post.content = "AAA";
            post.save(function (err, p) {
                should.not.exist(err);
                should.not.exist(p._id);
                p.id.should.be.equal(post.id);
                p.content.should.be.equal("AAA");
                done();
            });
        });
    });

    describe("updateAll", function () {
        it("should update the instance matching criteria", function (done) {
            User.create({
                "name": "Sunjith",
                "age": 31,
                "email": "sunjith@ezeelogin"
            }, function (err1, createdusers1) {
                // console.log(err1, createdusers1);
                should.not.exist(err1);
                User.create({
                    "name": "Bidhu",
                    "age": 32,
                    "email": "bidhu@ezeelogin"
                }, function (err2, createdusers2) {
                    // console.log(err1, createdusers2);
                    should.not.exist(err2);
                    User.create({
                        "name": "Vinod",
                        "age": 31,
                        "email": "vinodkv@ezeelogin"
                    }, function (err3, createdusers3) {
                        // console.log(err1, createdusers3);
                        should.not.exist(err3);

                        User.updateAll({
                            "age": 31
                        },
                        {
                            "company": "admod.com"
                        }, function (err, updatedusers) {
                            // console.log(err, updatedusers);
                            should.not.exist(err);
                            updatedusers.should.have.property("count", 2);

                            User.find({
                                "where": {
                                    "age": 31
                                }
                            }, function (err2, foundusers) {
                                should.not.exist(err2);
                                foundusers[0].company.should.be.equal("admod.com");
                                foundusers[1].company.should.be.equal("admod.com");
                                done();
                            });
                        });
                    });
                });
            });
        });

        it("should clean the data object", function (done) {
            User.dataSource.settings.allowExtendedOperators = true;

            User.create({
                "name": "Sunjith",
                "age": 31,
                "email": "sunjith@ezeelogin"
            }, function (err1, createdusers1) {
                // console.log(err1, createdusers1);
                should.not.exist(err1);
                User.create({
                    "name": "Bachchan",
                    "age": 32,
                    "email": "bachchan@ezeelogin"
                }, function (err2, createdusers2) {
                    // console.log(err1, createdusers2);
                    should.not.exist(err2);
                    User.create({
                        "name": "Vinod",
                        "age": 31,
                        "email": "vinodkv@ezeelogin"
                    }, function (err3, createdusers3) {
                        // console.log(err1, createdusers3);
                        should.not.exist(err3);

                        User.updateAll({}, {
                            "age": 40
                        }, function (err, updatedusers) {
                            // console.log(err, updatedusers);
                            should.not.exist(err);
                            updatedusers.should.have.property("count", 3);

                            User.find({
                                "where": {
                                    "age": 39
                                }
                            }, function (err2, foundusers) {
                                // console.log(err2, foundusers);
                                should.not.exist(err2);
                                foundusers.length.should.be.equal(0);

                                User.find({
                                    "where": {
                                        "age": 40
                                    }
                                }, function (err3, foundusers) {
                                    // console.log(err3, foundusers);
                                    should.not.exist(err3);
                                    foundusers.length.should.be.equal(3);

                                    User.updateAll({}, {
                                        "age": 39
                                    }, function (err, updatedusers) {
                                        // console.log(err, updatedusers);
                                        should.not.exist(err);
                                        updatedusers.should.have.property("count", 3);

                                        User.find({
                                            "where": {
                                                "age": 39
                                            }
                                        }, function (err2, foundusers) {
                                            // console.log(err2, foundusers);
                                            should.not.exist(err2);
                                            foundusers.length.should.be.equal(3);

                                            User.find({
                                                "where": {
                                                    "age": 40
                                                }
                                            }, function (err3, foundusers) {
                                                // console.log(err3, foundusers);
                                                should.not.exist(err3);
                                                foundusers.length.should.be.equal(0);
                                                done();
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });

    it("updateOrCreate should update the instance", function (done) {
        Post.create({
            "title": "a",
            "content": "AAA"
        }, function (err, post) {
            post.title = "b";
            Post.updateOrCreate(post, function (err, p) {
                should.not.exist(err);
                p.id.should.be.equal(post.id);
                p.content.should.be.equal(post.content);
                should.not.exist(p._id);

                Post.findById(post.id, function (err, p) {
                    p.id.should.be.eql(post.id);
                    should.not.exist(p._id);
                    p.content.should.be.equal(post.content);
                    p.title.should.be.equal("b");
                    done();
                });
            });
        });
    });

    it("updateAttributes: should append item to an Array if it doesn't already exist", function (done) {
        Product.dataSource.settings.allowExtendedOperators = true;
        Product.create({
            "name": "bread",
            "price": 100
        }, function (err, product) {
            var newAttributes = {
                "description": "goes well with butter"
            };

            product.updateAttributes(newAttributes, function (err1, inst) {
                // console.log(err1, inst);
                should.not.exist(err1);

                Product.findById(product.id, function (err2, updatedProduct) {
                    // console.log(err2, updatedProduct);
                    should.not.exist(err2);
                    should.not.exist(updatedProduct._id);
                    updatedProduct.id.should.be.eql(product.id);
                    updatedProduct.name.should.be.equal(product.name);
                    updatedProduct.description.should.be.equal("goes well with butter");
                    done();
                });
            });
        });
    });

    it("updateOrCreate: should append item to an Array if it doesn't already exist", function (done) {
        Product.dataSource.settings.allowExtendedOperators = true;
        Product.create({
            "name": "bread",
            "price": 100
        }, function (err, product) {
            product.description = "goes well with butter";

            Product.updateOrCreate(product, function (err, updatedproduct) {
                should.not.exist(err);
                should.not.exist(updatedproduct._id);
                updatedproduct.id.should.be.eql(product.id);
                updatedproduct.name.should.be.equal(product.name);
                updatedproduct.description.should.be.equal("goes well with butter");
                done();
            });
        });
    });

    it("updateOrCreate: should handle array updation without errors", function (done) {
        Product.dataSource.settings.allowExtendedOperators = true;
        Product.create({
            "name": "bread",
            "price": 100,
            "ingredients": ["flour"]
        }, function (err, product) {
            product.description = "goes well with butter";
            product.ingredients.push("water");

            Product.updateOrCreate(product, function (err, updatedproduct) {
                should.not.exist(err);
                should.not.exist(updatedproduct._id);
                updatedproduct.id.should.be.eql(product.id);
                updatedproduct.name.should.be.equal(product.name);
                updatedproduct.description.should.be.equal("goes well with butter");
                updatedproduct.ingredients[0].should.be.equal("flour");
                updatedproduct.ingredients[1].should.be.equal("water");
                done();
            });
        });
    });

    it("updateOrCreate should update the instance without removing existing properties", function (done) {
        Post.create({
            "title": "a",
            "content": "AAA",
            "comments": ["Comment1"]
        }, function (err, post) {
            post = post.toObject();
            delete post.title;
            delete post.comments;
            Post.updateOrCreate(post, function (err, p) {
                should.not.exist(err);
                p.id.should.be.equal(post.id);
                p.content.should.be.equal(post.content);
                should.not.exist(p._id);

                Post.findById(post.id, function (err, p) {
                    p.id.should.be.eql(post.id);
                    should.not.exist(p._id);
                    p.content.should.be.equal(post.content);
                    p.title.should.be.equal("a");
                    p.comments[0].should.be.equal("Comment1");
                    done();
                });
            });
        });
    });

    it("updateOrCreate should create a new instance if it does not exist", function (done) {
        var post = {
            "id": "123",
            "title": "a",
            "content": "AAA"
        };

        Post.updateOrCreate(post, function (err, p) {
            should.not.exist(err);
            p.title.should.be.equal(post.title);
            p.content.should.be.equal(post.content);
            p.id.should.be.eql(post.id);

            Post.findById(p.id, function (err, p) {
                p.id.should.be.equal(post.id);
                should.not.exist(p._id);
                p.content.should.be.equal(post.content);
                p.title.should.be.equal(post.title);
                p.id.should.be.equal(post.id);
                done();
            });
        });
    });

    it("save should update the instance with the same id", function (done) {
        Post.create({
            "title": "a",
            "content": "AAA"
        }, function (err, post) {
            post.title = "b";
            post.save(function (err, p) {
                should.not.exist(err);
                p.id.should.be.equal(post.id);
                p.content.should.be.equal(post.content);
                should.not.exist(p._id);

                Post.findById(post.id, function (err, p) {
                    p.id.should.be.eql(post.id);
                    should.not.exist(p._id);
                    p.content.should.be.equal(post.content);
                    p.title.should.be.equal("b");
                    done();
                });
            });
        });
    });

    it("save should update the instance without removing existing properties", function (done) {
        Post.create({
            "title": "a",
            "content": "AAA"
        }, function (err, post) {
            delete post.title;
            post.save(function (err, p) {
                should.not.exist(err);
                p.id.should.be.equal(post.id);
                p.content.should.be.equal(post.content);
                should.not.exist(p._id);

                Post.findById(post.id, function (err, p) {
                    p.id.should.be.eql(post.id);
                    should.not.exist(p._id);
                    p.content.should.be.equal(post.content);
                    p.title.should.be.equal("a");
                    done();
                });
            });
        });
    });

    it("save should create a new instance if it does not exist", function (done) {
        var post = new Post({
            "id": "123",
            "title": "a",
            "content": "AAA"
        });

        post.save(post, function (err, p) {
            should.not.exist(err);
            p.title.should.be.equal(post.title);
            p.content.should.be.equal(post.content);
            p.id.should.be.equal(post.id);

            Post.findById(p.id, function (err, p) {
                p.id.should.be.equal(post.id);
                should.not.exist(p._id);
                p.content.should.be.equal(post.content);
                p.title.should.be.equal(post.title);
                p.id.should.be.equal(post.id);
                done();
            });
        });
    });

    it("all should return object with an id but not neo4j _id", function (done) {
        var post = new Post({
            "title": "a",
            "content": "AAA"
        });

        post.save(function (err, post) {
            Post.all({
                "where": {
                    "title": "a"
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.lengthOf(1);
                post = posts[0];
                post.should.have.property("title", "a");
                post.should.have.property("content", "AAA");
                should.not.exist(post._id);
                done();
            });
        });
    });

    it("all return should honor filter.fields", function (done) {
        var post = new Post({
            "title": "b",
            "content": "BBB"
        });

        post.save(function (err, post) {
            Post.all({
                "fields": ["title"],
                "where": {
                    "title": "b"
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.lengthOf(1);
                post = posts[0];
                post.should.have.property("title", "b");
                post.should.have.property("content", undefined);
                should.not.exist(post._id);
                should.not.exist(post.id);
                done();
            });
        });
    });

    it("should report error on duplicate keys", function (done) {
        db.autoupdate("Post", function () {
            Post.create({
                "title": "d",
                "content": "DDD"
            }, function (err, post) {
                Post.create({
                    "id": post.id,
                    "title": "d",
                    "content": "DDD"
                }, function (err, post) {
                    // console.log(err, post);
                    should.exist(err);
                    done();
                });
            });
        });
    });

    it("should allow to find using like", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "title": {
                        "like": "M.+st"
                    }
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 1);
                done();
            });
        });
    });

    it("should support like for no match", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "title": {
                        "like": "M.+XY"
                    }
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 0);
                done();
            });
        });
    });

    it("should allow to find using nlike", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "title": {
                        "nlike": "M.+st"
                    }
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 0);
                done();
            });
        });
    });

    it("should support nlike for no match", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "title": {
                        "nlike": "M.+XY"
                    }
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 1);
                done();
            });
        });
    });

    it("should support 'and' operator that is satisfied", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "and": [
                        {
                            "title": "My Post"
                        },
                        {
                            "content": "Hello"
                        }
                    ]
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 1);
                done();
            });
        });
    });

    it("should support 'and' operator that is not satisfied", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "and": [
                        {
                            "title": "My Post"
                        },
                        {
                            "content": "Hello1"
                        }
                    ]
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 0);
                done();
            });
        });
    });

    it("should support 'or' that is satisfied", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "or": [
                        {
                            "title": "My Post"
                        },
                        {
                            "content": "Hello1"
                        }
                    ]
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 1);
                done();
            });
        });
    });

    it("should support 'or' operator that is not satisfied", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "or": [
                        {
                            "title": "My Post1"
                        },
                        {
                            "content": "Hello1"
                        }
                    ]
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 0);
                done();
            });
        });
    });

    it("should support 'neq' for match", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "title": {
                        "neq": "XY"
                    }
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 1);
                done();
            });
        });
    });

    it("should support 'neq' for no match", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.find({
                "where": {
                    "title": {
                        "neq": "My Post"
                    }
                }
            }, function (err, posts) {
                should.not.exist(err);
                posts.should.have.property("length", 0);
                done();
            });
        });
    });

    // The where object should be parsed by the connector
    it("should support where for count", function (done) {
        Post.create({
            "title": "My Post",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.count({
                "and": [
                    {
                        "title": "My Post"
                    },
                    {
                        "content": "Hello"
                    }
                ]
            }, function (err, count) {
                should.not.exist(err);
                count.should.be.equal(1);
                Post.count({
                    "and": [
                        {
                            "title": "My Post1"
                        },
                        {
                            "content": "Hello"
                        }
                    ]
                }, function (err, count) {
                    should.not.exist(err);
                    count.should.be.equal(0);
                    done();
                });
            });
        });
    });

    // The where object should be parsed by the connector
    it("should support where for destroyAll", function (done) {
        Post.create({
            "title": "My Post1",
            "content": "Hello"
        }, function (err, post) {
            // console.log(err, post);
            Post.create({
                "title": "My Post2",
                "content": "Hello"
            }, function (err, post) {
                // console.log(err, post);
                Post.destroyAll({
                    "and": [
                        {
                            "title": "My Post1"
                        },
                        {
                            "content": "Hello"
                        }
                    ]
                }, function (err) {
                    should.not.exist(err);
                    Post.count(function (err, count) {
                        should.not.exist(err);
                        count.should.be.equal(1);
                        done();
                    });
                });
            });
        });
    });

    // Test raw query execution
    it("should execute raw cypher query", function (done) {
        db.connector.execute({
            "query": "MATCH (n) RETURN n LIMIT 100"
        }, function (err, result) {
            // console.log(err, result);
            should.not.exist(err);
            should.exist(result);
            done();
        });
    });

    // Test raw query with params execution
    it("should execute raw cypher query", function (done) {
        db.connector.execute({
            "query": "CREATE (n:Person {name: {name}}) RETURN n",
            "params": {
                "name": "Arthur"
            }
        }, function (err, result) {
            // console.log(err, result);
            // console.log("Person:", result[0].n.labels, result[0].n.properties);
            should.not.exist(err);
            should.exist(result);
            result.should.have.lengthOf(1);
            result[0].n.properties.name.should.be.equal("Arthur");
            done();
        });
    });

    after(function (done) {
        User.destroyAll(function () {
            Post.destroyAll(function () {
                PostWithNumberId.destroyAll(function () {
                    Product.destroyAll(function () {
                        db.connector.execute({
                            "query": "MATCH (n:Person) DELETE n"
                        }, function (err, result) {
                            done();
                        });
                    });
                });
            });
        });
    });
});
