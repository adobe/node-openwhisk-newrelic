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

// Manual test utility to run mock server in a separate process
//
// Useful if running with NODE_DEBUG=* logging and wanting to separate
// client side from server side logs
//
// To use it:
// 1. adjust logic below as needed
// 2. run using "node test/util/mock-server.js"
// 3. note the port number
// 4. go into test case such as test/probe/http-client.test.js
// 5. edit it to connect to "localhost:<port>" and disable mockServer() there

"use strict";

const ServerMock = require("mock-http-server");

const TEST_REQUEST_ID = "test-request-id";

const server = new ServerMock({
    host: "localhost"
});

server.mock = function(method, path) {
    server.on({
        method: method,
        path: path,
        reply: {
            status:  200,
            headers: {"x-request-id": TEST_REQUEST_ID},
            body:    JSON.stringify({ok: true})
        }
    });
};

function ready() {
    console.log("started mock server on port", server.getHttpPort());
    server.mock("PUT", "/put");
}

server.start(ready);

