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

// This file is loaded only for the node-fetch tests from "npm run node-fetch-test"
// to inject the http client instrumentation into that test run. It is excluded
// for the local unit tests.
// Note: this has no .js extension so it gets excluded by the Mocha Test Explorer in VS Code.
'use strict';

console.log("Injecting lib/instrument/http-client into node-fetch tests...");

const httpClientProbe = require("../lib/probe/http-client");

let metricCounter = 0;

// eslint-disable-next-line no-unused-vars
httpClientProbe.start((metrics) => {
    // console.log(metrics);
    metricCounter++;
});

// prevent tests from hanging at end
process.env.__OW_DEADLINE = Date.now() + 10;

after(() => {
    if (metricCounter <= 10) {
        throw new Error("Did not properly instrument node http client, test results are not valid");
    }
});