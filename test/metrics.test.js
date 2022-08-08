/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */


/* eslint-env mocha */
/* eslint-disable mocha/no-mocha-arrows */

"use strict";

const rewire = require("rewire");
const assert = require("assert");
const fs = require("fs-extra");
const Metrics = rewire("../lib/metrics");
const process = require("process");
const mockFs = require('mock-fs');

describe("metrics.js", () => {

    describe("timestamps", () => {

        it("timestamp", () => {
            const timestamp = Metrics.timestamp();
            assert.ok(typeof timestamp === "number");
        });
    });

    describe("container memory size", () => {
        beforeEach( () => {
            mockFs();
        });

        afterEach(() => {
            mockFs.restore();
        });

        it("should return container memory size", () => {
            mockFs({
                '/sys/fs/cgroup': {
                    'memory': {
                        'memory.limit_in_bytes': '9999'
                    }
                }
            });
            const containerMemorySize = Metrics.openwhisk().containerMemorySize;
            assert.ok(typeof containerMemorySize === "number");
            assert.equal(containerMemorySize, 9999);
        });

        it("should return container memory size added to existing metrics", () => {
            mockFs({
                '/sys/fs/cgroup': {
                    'memory': {
                        'memory.limit_in_bytes': '9999'
                    }
                }
            });
            const metrics = Metrics.openwhisk({ test: 1 });
            assert.ok(typeof metrics.containerMemorySize === "number");
            assert.equal(metrics.containerMemorySize, 9999);
            assert.equal(metrics.test, 1);
        });

        it("should return container os and version added to existing metrics", () => {
            mockFs({
                '/etc/os-release': 'NAME="Ubuntu" \n VERSION_ID="22.04"'
            });
            const metrics = Metrics.openwhisk({ test: 1 });
            assert.ok(typeof metrics.containerOS === "string");
            assert.ok(typeof metrics.containerOSVersion === "string");
            assert.equal(metrics.containerOS, "Ubuntu");
            assert.equal(metrics.containerOSVersion, "22.04");
            assert.equal(metrics.test, 1);
        });

        it("should return container os and version from alternate path and add to existing metrics", () => {
            mockFs({
                '/usr/lib/os-release': 'NAME="Ubuntu" \n VERSION_ID="22.04"'
            });
            const metrics = Metrics.openwhisk({ test: 1 });
            assert.ok(typeof metrics.containerOS === "string");
            assert.ok(typeof metrics.containerOSVersion === "string");
            assert.equal(metrics.containerOS, "Ubuntu");
            assert.equal(metrics.containerOSVersion, "22.04");
            assert.equal(metrics.test, 1);
        });

        it("should ignore container os and version in metrics if unset", () => {
            mockFs({
                '/etc/os-release': 'INVALID_NAME="Ubuntu" \n INVALID_VERSION_ID="22.04"'
            });
            const metrics = Metrics.openwhisk({ test: 1 });
            assert.ok(typeof metrics.containerOS === "undefined");
            assert.ok(typeof metrics.containerOSVersion === "undefined");
            assert.equal(metrics.test, 1);
        });

        it("should ignore container os and version in metrics if unavailable", () => {
            const metrics = Metrics.openwhisk({ test: 1 });
            assert.ok(typeof metrics.containerOS === "undefined");
            assert.ok(typeof metrics.containerOSVersion === "undefined");
            assert.equal(metrics.test, 1);
        });

        it("should ignore container os and version in metrics if error occurs when gathering", () => {
            // mock file as a directory to induce error
            mockFs({
                '/etc/os-release': {}
            });

            const metrics = Metrics.openwhisk({ test: 1 });
            assert.ok(typeof metrics.containerOS === "undefined");
            assert.ok(typeof metrics.containerOSVersion === "undefined");
            assert.equal(metrics.test, 1);
        });

        it("should overwrite existing container size metric", () => {
            mockFs({
                '/sys/fs/cgroup': {
                    'memory': {
                        'memory.limit_in_bytes': '9999'
                    }
                }
            });
            const containerMemorySize = Metrics.openwhisk({ containerMemorySize: 1 }).containerMemorySize;
            assert.ok(typeof containerMemorySize === "number");
            assert.equal(containerMemorySize, 9999);
        });

        it("should return undefined if not running in the context of docker container", () => {
            const containerMemorySize = Metrics.openwhisk().containerMemorySize;
            assert.equal(containerMemorySize, undefined);
        });

        it("should return undefined if the file is malformed", () => {
            mockFs({
                '/sys/fs/cgroup': {
                    'memory': {
                        'memory.limit_in_bytes': 'ksekfgfbnsy'
                    }
                }
            });
            let containerMemorySize = Metrics.openwhisk().containerMemorySize;
            assert.equal(containerMemorySize, undefined);

            mockFs({
                '/sys/fs/cgroup': {
                    'memory': {
                        'memory.limit_in_bytes': {
                            'hello': '1'
                        }
                    }
                }
            });
            containerMemorySize = Metrics.openwhisk().containerMemorySize;
            assert.equal(containerMemorySize, undefined);
        });
    });

    describe("openwhisk", () => {

        it("should return nodeVersion metric", () => {
            assert.strictEqual(Metrics.openwhisk().nodeVersion, process.version.substr(1));
        });

        it("should return an object with just the action name - simple", () => {
            process.env.__OW_ACTION_NAME = "action";
            assert.strictEqual(Metrics.openwhisk().actionName, "action");
            delete process.env.__OW_ACTION_NAME;
        });

        it("should return an object with just the action name", () => {
            process.env.__OW_ACTION_NAME = "/namspace/action";
            assert.strictEqual(Metrics.openwhisk().actionName, "action");
            delete process.env.__OW_ACTION_NAME;
        });

        it("should return an object with package name and action name", () => {
            process.env.__OW_ACTION_NAME = "/namspace/package/action";
            assert.strictEqual(Metrics.openwhisk().actionName, "action");
            assert.strictEqual(Metrics.openwhisk().package, "package");
            delete process.env.__OW_ACTION_NAME;
        });

        it("should return an object with the namespace", () => {
            process.env.__OW_NAMESPACE = "namespace";
            assert.strictEqual(Metrics.openwhisk().namespace, "namespace");
            delete process.env.__OW_NAMESPACE;
        });

        it("should return an object with the activationId and transactionId", () => {
            process.env.__OW_ACTIVATION_ID = "activationId";
            process.env.__OW_TRANSACTION_ID = "transactionId";
            assert.strictEqual(Metrics.openwhisk().activationId, "activationId");
            assert.strictEqual(Metrics.openwhisk().transactionId, "transactionId");
            delete process.env.__OW_ACTIVATION_ID;
            delete process.env.__OW_TRANSACTION_ID;
        });

        it("should return an object with the cloud and region", () => {
            process.env.__OW_CLOUD = "aws";
            process.env.__OW_REGION = "us-east-1";
            assert.strictEqual(Metrics.openwhisk().cloud, "aws");
            assert.strictEqual(Metrics.openwhisk().region, "us-east-1");
            delete process.env.__OW_CLOUD;
            delete process.env.__OW_REGION;
        });

        it("should return an object with the hostname and container name", () => {
            process.env.HOSTNAME = "c83a670f6ab6";
            process.env.MESOS_CONTAINER_NAME = "mesos-d90db22e-d4e6-446c-841b-472f08738cc0-S24.02ffc381-30e9-40ce-b182-6dc6dd7c57d2";
            assert.strictEqual(Metrics.openwhisk().activationHost, "c83a670f6ab6");
            assert.strictEqual(Metrics.openwhisk().activationContainerName, "mesos-d90db22e-d4e6-446c-841b-472f08738cc0-S24.02ffc381-30e9-40ce-b182-6dc6dd7c57d2");
            delete process.env.HOSTNAME;
            delete process.env.MESOS_CONTAINER_NAME;
        });
    });

    describe("flatten", () => {
        it("empty", () => {
            const flatten = Metrics.flatten({});
            assert.deepStrictEqual(flatten, {});
        });

        it("unsupported property type: function", () => {
            try {
                Metrics.flatten({ value: function() {
                    console.log('Scary function!');
                }});
                assert.fail('Should have failed');
            } catch(e) {
                assert(e.message.includes("Unsupported property"));
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

        it("truncates long strings", () => {
            const maxLength = Metrics.__get__("DEFAULT_MAX_STRING_LENGTH");
            assert(maxLength > 0, "Should provide some kind of default max length");
            const longValue = "!".repeat(maxLength + 100);            
            const flatten = Metrics.flatten({value : longValue});
            assert(flatten.value.length === maxLength);
        });

        it("truncates long error metric strings to configured length", () => {
            const maxLength = Metrics.__get__("DEFAULT_MAX_STRING_LENGTH");
            const maxErrorLength = Metrics.__get__("DEFAULT_ERROR_METRIC_MAX_STRING_LENGTH");
            const longValue = "!".repeat(maxErrorLength + maxLength + 100);
            const flatten = Metrics.flatten({
                message: longValue,
                errorMessage: longValue,
                error: longValue,
                nonErrorMessage: longValue,
            });
            // applies error metric max length
            assert(flatten.message.length === maxErrorLength);
            assert(flatten.errorMessage.length === maxErrorLength);
            assert(flatten.error.length === maxErrorLength);
            // applies normal string max length
            assert(flatten.nonErrorMessage.length === maxLength);
        });

        it("truncates error metrics on nested object to configured length", () => {
            const maxLength = Metrics.__get__("DEFAULT_MAX_STRING_LENGTH");
            const maxErrorLength = Metrics.__get__("DEFAULT_ERROR_METRIC_MAX_STRING_LENGTH");
            const longValue = "!".repeat(maxErrorLength + maxLength + 100);

            const nested = {
                errorMessage: longValue,
                nonErrorMessage: longValue
            };
            const flatten = Metrics.flatten({ nested });
            // applies error metric max length
            assert(flatten.nested_errorMessage.length === maxErrorLength);
            // applies normal string max length
            assert(flatten.nested_nonErrorMessage.length === maxLength);
        });

        it("truncates error metrics to length set in env variable", () => {
            process.env.NEW_RELIC_ERROR_METRIC_MAX_STRING_LENGTH = 1200;
            // rewire Metrics after env variable set
            const MetricsWithEnvVar = rewire("../lib/metrics");
            const maxErrorLength = MetricsWithEnvVar.__get__("DEFAULT_ERROR_METRIC_MAX_STRING_LENGTH");
            const longValue = "!".repeat(maxErrorLength + 100);

            const flatten = MetricsWithEnvVar.flatten({
                message: longValue
            });
            // applies error metric max length
            assert(flatten.message.length === 1200);
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

                assert.strictEqual(flatten.e_code, "ENOENT");
                assert.strictEqual(flatten.e_name, "Error");
                assert.strictEqual(flatten.e_syscall, "open");
                assert(flatten.e_message.includes('does-not-exist.dat'));
                assert(flatten.e_path.includes("does-not-exist.dat"));

                if (flatten.e_errno !== -2 && flatten.e_errno !== -4058) {

                    assert.fail("Error value did not match");
                }
            }
        });
        it("not-iterable", () => {
            try {
                const x = 5;
                for (const a of x) { a; }
            } catch (e) {
                const flatten = Metrics.flatten({ e });
                assert.deepStrictEqual(flatten, {
                    e_message: "x is not iterable",
                    e_name: "TypeError"
                });
            }
        });
    });
});
