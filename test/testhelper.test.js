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

'use strict';

const MetricsTestHelper = require("../lib/testhelper");
const assert = require("assert");

const NON_OBJECTS = [
    undefined,
    null,
    "string",
    123,
    3.14,
    false,
    true,
    () => {}
];

const NON_ARRAYS = [
    undefined,
    null,
    "string",
    123,
    3.14,
    false,
    true,
    /regexp/,
    {}
];

function assertAssertionFails(cb, message) {
    assert.throws(cb, assert.AssertionError, message);
}

describe("testhelper.js", function() {

    describe("assertObjectMatches", function() {

        it("fails if no object is passed as actual", function() {
            NON_OBJECTS.forEach((e) => {
                assertAssertionFails(
                    () => MetricsTestHelper.assertObjectMatches(e, { key: "value" }),
                    `for actual value: ${e}`
                );
            });
        });

        it("fails if no object is passed as expected", function() {
            NON_OBJECTS.forEach((e) => {
                assertAssertionFails(
                    () => MetricsTestHelper.assertObjectMatches({ key: "value" }, e),
                    `for expected value: ${e}`
                );
            });
        });

        it("succeeds with exact match", function() {
            MetricsTestHelper.assertObjectMatches({
                key: "value"
            }, {
                key: "value"
            });
        });

        it("fails on incorrect match", function() {
            assertAssertionFails(() => MetricsTestHelper.assertObjectMatches({ key: "value2" }, { key: "value" }));
            // TODO: add more primitive types
        });

        it("succeeds with regexp match", function() {
            MetricsTestHelper.assertObjectMatches({ key: "value" }, { key: /val/ });
        });

        it("succeeds on partial match", function() {
            MetricsTestHelper.assertObjectMatches({
                key: "value",
                more: "properties",
                should: "be ignored"
            }, {
                key: "value"
            });
        });
    });

    describe("assertArrayMatches", function() {

        it("fails if no array is passed as actual", function() {
            NON_ARRAYS.forEach((e) => {
                assertAssertionFails(
                    () => MetricsTestHelper.assertArrayMatches(e, []),
                    `for actual value: ${e}`
                );
            });
        });

        it("fails if no array is passed as expected", function() {
            NON_ARRAYS.forEach((e) => {
                assertAssertionFails(
                    () => MetricsTestHelper.assertArrayMatches([], e),
                    `for expected value: ${e}`
                );
            });
        });

        it("fails if arrays are not equal", function() {
            const EXPECTED = [{ key: "value" }];
            const ACTUAL = [];
            assertAssertionFails(() => MetricsTestHelper.assertArrayMatches(ACTUAL, EXPECTED));
        });

        it("fails if arrays have not the same length", function() {
            const EXPECTED = [{ key: "value" }];
            const ACTUAL = [{ key: "value" }, { key: "value" }];
            assertAssertionFails(() => MetricsTestHelper.assertArrayMatches(ACTUAL, EXPECTED));
        });

        it("succeeds if arrays are equal", function() {
            const EXPECTED = [{ key: "value" }];
            const ACTUAL = [{ key: "value" }];
            MetricsTestHelper.assertArrayMatches(ACTUAL, EXPECTED);
        });

        it("succeeds on partial match", function() {
            MetricsTestHelper.assertArrayMatches([{
                key: "value",
                more: "properties",
                should: "be ignored"
            }], [{
                key: "value"
            }]);
        });
    });

    describe("assertArrayContains", function() {

        it("fails if no array is passed as actual", function() {
            NON_ARRAYS.forEach((e) => {
                assertAssertionFails(
                    () => MetricsTestHelper.assertArrayContains(e, []),
                    `for actual value: ${e}`
                );
            });
        });

        it("fails if no array is passed as expected", function() {
            NON_ARRAYS.forEach((e) => {
                assertAssertionFails(
                    () => MetricsTestHelper.assertArrayContains([], e),
                    `for expected value: ${e}`
                );
            });
        });

        it("succeeds if arrays are equal", function() {
            const EXPECTED = [{ key: "value" }];
            const ACTUAL = [{ key: "value" }];
            MetricsTestHelper.assertArrayContains(ACTUAL, EXPECTED);
        });

        it("succeeds on partial array match", function() {
            const EXPECTED = [{ key: "value" }];
            MetricsTestHelper.assertArrayContains(
                [{ key: "value" }, { some: "other" }],
                EXPECTED
            );

            // different order
            MetricsTestHelper.assertArrayContains(
                [{ some: "other" },{ key: "value" }],
                EXPECTED
            );
        });

        it("succeeds on partial object match", function() {
            MetricsTestHelper.assertArrayContains([{
                key: "value",
                more: "properties",
                should: "be ignored"
            }], [{
                key: "value"
            }]);
            MetricsTestHelper.assertArrayContains([{
                key: "value",
                more: "properties",
                should: "be ignored"
            },{
                some: "other"
            }], [{
                key: "value"
            }]);
        });

        it("fails if no match", function() {
            const EXPECTED = [{ key: "value" }];
            const ACTUAL = [{some: "other"}];
            assertAssertionFails(() => MetricsTestHelper.assertArrayContains(ACTUAL, EXPECTED));
        });
    });
});