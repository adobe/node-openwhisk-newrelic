/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
* Copyright 2019 Adobe
* All Rights Reserved.
*
* NOTICE: All information contained herein is, and remains
* the property of Adobe and its suppliers, if any. The intellectual
* and technical concepts contained herein are proprietary to Adobe
* and its suppliers and are protected by all applicable intellectual
* property laws, including trade secret and copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe.
**************************************************************************/

/* eslint-env mocha */
/* eslint-disable mocha/no-mocha-arrows */

"use strict";

const assert = require("assert");
const fs = require("fs-extra");
const Metrics = require("../lib/metrics");
const process = require("process");

describe("metrics", () => {
    describe("timestamps", () => {
        it("timestamp", () => {
            const timestamp = Metrics.timestamp();
            assert.ok(typeof timestamp === "number");
        });
        it("start-empty", () => {
            const start = Metrics.start();
            assert.ok(typeof start.start === "number");
        });
        it("start-object", () => {
            const metrics = {};
            const start = Metrics.start(metrics);
            assert.ok(typeof start.start === "number");
            assert.strictEqual(metrics, start);
        });
        it("end", () => {
            const start = Metrics.start();
            const end = Metrics.end(start);
            assert.ok(typeof end.start === "number");
            assert.ok(typeof end.end === "number");
            assert.strictEqual(end.end - end.start, end.duration);
            assert.strictEqual(start, end);
        });
    });
    describe("openwhisk", () => {
        it("empty", () => {
            assert.deepStrictEqual(Metrics.openwhisk(), {});
        });
        it("actionName-simple", () => {
            process.env.__OW_ACTION_NAME = "action";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                actionName: "action"
            });
            delete process.env.__OW_ACTION_NAME;
        });
        it("actionName", () => {
            process.env.__OW_ACTION_NAME = "/namspace/action";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                actionName: "action"
            });
            delete process.env.__OW_ACTION_NAME;
        });

        it("package", () => {
            process.env.__OW_ACTION_NAME = "/namspace/package/action";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                actionName: "action",
                package:"package"
            });
            delete process.env.__OW_ACTION_NAME;
        });
        it("namespace", () => {
            process.env.__OW_NAMESPACE = "namespace";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                namespace: "namespace"
            });
            delete process.env.__OW_NAMESPACE;
        });
        it("activationId", () => {
            process.env.__OW_ACTIVATION_ID = "activationId";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                activationId: "activationId"
            });
            delete process.env.__OW_ACTIVATION_ID;
        });
    })
    describe("summary", () => {
        it("numbers-array", () => {
            const summary = Metrics.summary([1, 2, 3, 4, 5, 6, 7, 8]);
            // limit stdev to 3 digits after the dot for comparison
            summary.stdev = Math.round(summary.stdev * 1000) / 1000;
            assert.deepStrictEqual(summary, {
                max: 8,
                mean: 4.5,
                median: 4.5,
                min: 1,
                q1: 2.75,
                q3: 6.25,
                stdev: 2.449
            });
        });
        it("numbers-set", () => {
            const summary = Metrics.summary(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
            // limit stdev to 3 digits after the dot for comparison
            summary.stdev = Math.round(summary.stdev * 1000) / 1000;
            assert.deepStrictEqual(summary, {
                max: 8,
                mean: 4.5,
                median: 4.5,
                min: 1,
                q1: 2.75,
                q3: 6.25,
                stdev: 2.449
            });
        });
        it("objects-array", () => {
            const summary = Metrics.summary([{
                counter: 1,
                constant: 5
            }, {
                counter: 2,
                constant: 5
            }, {
                counter: 3,
                constant: 5
            }, {
                counter: 4,
                constant: 5
            }, {
                counter: 5,
                constant: 5
            }, {
                counter: 6,
                constant: 5
            }, {
                counter: 7,
                constant: 5
            }, {
                counter: 8,
                constant: 5
            }]);
            // limit stdev to 3 digits after the dot for comparison
            summary.counter.stdev = Math.round(summary.counter.stdev * 1000) / 1000;
            assert.deepStrictEqual(summary, {
                counter: {
                    max: 8,
                    mean: 4.5,
                    median: 4.5,
                    min: 1,
                    q1: 2.75,
                    q3: 6.25,
                    stdev: 2.449
                },
                constant: {
                    max: 5,
                    mean: 5,
                    median: 5,
                    min: 5,
                    q1: 5,
                    q3: 5,
                    stdev: 0
                }
            });
        });
    });
    describe("flatten", () => {
        it("empty", () => {
            const flatten = Metrics.flatten({});
            assert.deepStrictEqual(flatten, {});
        });
        it("number", () => {
            const flatten = Metrics.flatten({ value: 1 });
            assert.deepStrictEqual(flatten, { value: 1 });
        });
        it("bigint", () => {
            // eslint-disable-next-line no-undef
            const value = BigInt(1);
            const flatten = Metrics.flatten({ value });
            assert.deepStrictEqual(flatten, { value: "1" });
        });
        it("string", () => {
            const flatten = Metrics.flatten({ value: "1" });
            assert.deepStrictEqual(flatten, { value: "1" });
        });
        it("boolean", () => {
            const flatten = Metrics.flatten({ value1: true, value2: false });
            assert.deepStrictEqual(flatten, { value1: 1, value2: 0 });
        });
        it("null", () => {
            const flatten = Metrics.flatten({ value: null });
            assert.deepStrictEqual(flatten, { });
        });
        it("undefined", () => {
            const flatten = Metrics.flatten({ value: undefined });
            assert.deepStrictEqual(flatten, { });
        });
        it("nested", () => {
            const flatten = Metrics.flatten({ value: { nested: 1 } });
            assert.deepStrictEqual(flatten, { value_nested: 1 });
        });
        it("map", () => {
            // 123 should be filtered out
            const flatten = Metrics.flatten({
                value: new Map([
                    [ "key1", 123 ],
                    [ "key2", "value2" ],
                    [ "key3", true ],
                    [ "key4", { nested: "x" } ],
                    [ 123, 456 ] 
                ])
            });
            assert.deepStrictEqual(flatten, { 
                value_key1: 123,
                value_key2: "value2",
                value_key3: 1,
                value_key4_nested: "x"
            });
        });
        it("array", () => {
            // 123 should be filtered out
            const flatten = Metrics.flatten({
                value: [ 1, 2, 3, 4, 5, 6, 7, 8 ]
            });
            // limit stdev to 3 digits after the dot for comparison
            flatten.value_stdev = Math.round(flatten.value_stdev * 1000) / 1000;
            assert.deepStrictEqual(flatten, { 
                value_max: 8,
                value_mean: 4.5,
                value_median: 4.5,
                value_min: 1,
                value_q1: 2.75,
                value_q3: 6.25,
                value_stdev: 2.449
            });
        });
        it("set", () => {
            // 123 should be filtered out
            const flatten = Metrics.flatten({
                value: new Set([ 1, 2, 3, 4, 5, 6, 7, 8 ])
            });
            // limit stdev to 3 digits after the dot for comparison
            flatten.value_stdev = Math.round(flatten.value_stdev * 1000) / 1000;
            assert.deepStrictEqual(flatten, { 
                value_max: 8,
                value_mean: 4.5,
                value_median: 4.5,
                value_min: 1,
                value_q1: 2.75,
                value_q3: 6.25,
                value_stdev: 2.449
            });
        });
        it("error", () => {
            const e = Error("error message");
            const flatten = Metrics.flatten({ e });
            assert.deepStrictEqual(flatten, { 
                e_name: "Error",
                e_message: "error message",
            });
        });
        it("system-error", async () => {
            try {
                await fs.readFile("does-not-exist.dat");
                assert.fail("should not reach this line");
            } catch (e) {
                const flatten = Metrics.flatten({ e });
                assert.deepStrictEqual(flatten, { 
                    e_code: "ENOENT",
                    e_errno: -2,
                    e_message: "ENOENT: no such file or directory, open 'does-not-exist.dat'",
                    e_name: "Error",
                    e_path: "does-not-exist.dat",
                    e_syscall: "open"
                });
            }
        });
        it("not-iterable", () => {
            try {
                const x = 5
                for (const a of x) { a; }
            } catch (e) {
                const flatten = Metrics.flatten({ e });
                assert.deepStrictEqual(flatten, { 
                    e_message: "x is not iterable",
                    e_name: "TypeError"
                });
            }
        })
    });
})