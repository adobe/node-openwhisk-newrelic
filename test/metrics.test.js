/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

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

                assert.deepStrictEqual(flatten.e_code, "ENOENT");
                assert.deepStrictEqual(flatten.e_errno, -2);
                assert.deepStrictEqual(flatten.e_name, "Error");
                assert.deepStrictEqual(flatten.e_path, "does-not-exist.dat");
                assert.deepStrictEqual(flatten.e_syscall, "open");
                assert.deepStrictEqual(true, flatten.e_message.includes('does-not-exist.dat'));
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
