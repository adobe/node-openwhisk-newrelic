/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
* Copyright 2020 Adobe
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

