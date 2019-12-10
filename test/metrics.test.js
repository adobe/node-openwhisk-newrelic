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
const Metrics = require('../lib/metrics');
const process = require("process");

describe("metrics", () => {
    describe("timestamps", () => {
        it("timestamp", () => {
            const timestamp = Metrics.timestamp();
            assert.ok(typeof timestamp === "number");
        });
    });
    describe("openwhisk", () => {
        it("should return an empty object when no environment variables are set", () => {
            assert.deepStrictEqual(Metrics.openwhisk(), {});
        });
        it("should return and object with just the action name - simple", () => {
            process.env.__OW_ACTION_NAME = "action";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                actionName: "action"
            });
            delete process.env.__OW_ACTION_NAME;
        });
        it("should return an object with just the action name", () => {
            process.env.__OW_ACTION_NAME = "/namspace/action";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                actionName: "action"
            });
            delete process.env.__OW_ACTION_NAME;
        });

        it("should return an object with package name and action name", () => {
            process.env.__OW_ACTION_NAME = "/namspace/package/action";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                actionName: "action",
                package:"package"
            });
            delete process.env.__OW_ACTION_NAME;
        });
        it("should return an object with the namespace", () => {
            process.env.__OW_NAMESPACE = "namespace";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                namespace: "namespace"
            });
            delete process.env.__OW_NAMESPACE;
        });
        it("should return an object with the activationId", () => {
            process.env.__OW_ACTIVATION_ID = "activationId";
            assert.deepStrictEqual(Metrics.openwhisk(), {
                activationId: "activationId"
            });
            delete process.env.__OW_ACTIVATION_ID;
        });
    })

    describe("flatten", () => {
        it("empty", () => {
            const flatten = Metrics.flatten({});
            assert.deepStrictEqual(flatten, {});
        });

        it("unsupported property type: function", () => {
            try {
                Metrics.flatten({ value: function() {
                    console.log('Scary function!')
                }});
                assert.fail('Should have failed');
            } catch(e) {
                assert(e.message.includes("Unsupported property"))
            }
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
        it("array - numbers", () => {
            // 123 should be filtered out
            const flatten = Metrics.flatten({
                value: [ 1, 2, 3, 4, 5, 6, 7, 8 ]
            });
            assert.deepStrictEqual(flatten, { value_mean: 4.5 });
        });
        it("array - strings", () => {
            // 123 should be filtered out
            const flatten = Metrics.flatten({
                value: [ 'one', 'two', 'three', 'four', 'five']
            });
            assert.deepStrictEqual(flatten, { value_item: 'one' });
        });
        it("set - numbers", () => {
            // 123 should be filtered out
            const flatten = Metrics.flatten({
                value: new Set([ 1, 2, 3, 4, 5, 6, 7, 8 ])
            });
            assert.deepStrictEqual(flatten, { value_mean: 4.5 });
        });
        it("set - strings", () => {
            // 123 should be filtered out
            const flatten = Metrics.flatten({
                value: new Set(['one', 'two', 'three', 'four', 'five'])
            });
            assert.deepStrictEqual(flatten, { value_item: 'one' });
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