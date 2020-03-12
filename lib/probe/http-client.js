/* eslint-disable prefer-rest-params */
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

"use strict";

const http = require("http");
const https = require("https");
const url = require("url");
const fnwrap = require("./fnwrap");

const NS_PER_SEC = 1e9;
const MS_PER_NS = 1e6;

// calculate time delta between two process.hrtime() results in milliseconds
function getDurationInMs(startTime, endTime) {
    if (!startTime || !endTime) {
        return undefined;
    }
    const deltaSec = endTime[0] - startTime[0]
    const deltaNanos = endTime[1] - startTime[1]
    return (deltaSec * NS_PER_SEC + deltaNanos) / MS_PER_NS
}

// taken from https://github.com/nodejs/node/blob/6de7b635a6185115975248efbc71fb8c205b59b6/lib/internal/url.js#L1271
function urlToOptions(url) {
    const options = {
        protocol: url.protocol,
        hostname: typeof url.hostname === 'string' && url.hostname.startsWith('[') ?
            url.hostname.slice(1, -1) :
            url.hostname,
        hash: url.hash,
        search: url.search,
        pathname: url.pathname,
        path: `${url.pathname || ''}${url.search || ''}`,
        href: url.href
    };
    if (url.port !== '') {
        options.port = Number(url.port);
    }
    if (url.username || url.password) {
        options.auth = `${url.username}:${url.password}`;
    }
    return options;
}

// taken from https://github.com/nodejs/node/blob/c1b2f6afbe03841a6f0ca5fa363ceb5bcdcfe638/lib/_http_client.js#L91
// https://nodejs.org/api/http.html#http_http_request_options_callback
//     http.request(options[, callback])
//     http.request(url[, options][, callback])
function httpOptions(input, options) {
    if (typeof input === 'string') {
        // input is url string to parse
        const urlStr = input;
        try {
            input = urlToOptions(new URL(urlStr));
        } catch (err) {
            // old deprecated method to parse urls
            input = url.parse(urlStr);
            if (!input.hostname) {
                throw err;
            }
        }
    } else if (input instanceof url.URL) {
        // url.URL instance
        input = urlToOptions(input);
    } else {
        options = input;
    }

    // merge input/url and options if options is there
    if (typeof options === 'function') {
        options = input || {};
    } else {
        options = Object.assign(input || {}, options);
    }

    return options;
}

class HttpRequestMetrics {
    constructor() {
        this.timings = {
            startAt: process.hrtime(),
            socketAt: undefined,
            dnsLookupAt: undefined,
            tcpConnectionAt: undefined,
            tlsHandshakeAt: undefined,
            sentRequestAt: undefined,
            firstByteAt: undefined,
            endAt: undefined,
            errorAt: undefined
        };
    }

    withRequestFn(requestFn) {
        this.requestFn = requestFn;
        return this;
    }

    withArgs(input, options, callback) {
        this.args = {
            input,
            options,
            callback
        };
        return this;
    }

    withMetricsCallback(cb) {
        this.metricsCallback = cb || (() => {});
        return this;
    }

    getRequest() {
        this.parseArgs();

        // invoke the original http/s.request() function
        this.request = this.invokeRequestFn();

        this.onRequest(this.request);

        return this.request;
    }

    parseArgs() {
        this.httpOptions = httpOptions(this.args.input, this.args.options);
    }

    invokeRequestFn() {
        return this.requestFn(this.args.input, this.args.options, this.args.callback);
    }

    trackRequestBody(request) {
        this.requestBodySize = 0;

        // wrap request.write() to count the request body size
        fnwrap.wrap(request, "write", (write) => {
            return (chunk, enc, cb) => {
                if (chunk && chunk.length) {
                    this.requestBodySize += chunk.length;
                }
                return write.call(request, chunk, enc, cb);
            };
        });
    }

    onRequest(request) {
        this.trackRequestBody(request);

        // using "prependListener" instead of "on" since we want to be the first
        // listener for accurate timings (when socket was available, etc.)
        request.prependListener("socket", (socket) => {
            this.onSocket(socket);
        });

        request.prependListener("finish", () => {
            // last byte of HTTP request has been sent out
            this.timings.sentRequestAt = process.hrtime();
        });

        request.prependListener("response", (response) => {
            this.onResponse(response);
        });

        request.prependOnceListener("error", (err) => {
            this.onError(err);
        });

        request.prependListener("timeout", () => {
            this.onTimeout();
        });
    }

    onResponse(response) {
        this.response = response;

        // custom header to correlate requests with logs and backend services in case of errors
        const requestId = response.headers["x-request-id"] || response.headers["x-correlation-id"];

        response.prependOnceListener("readable", () => {
            // first byte of response body has come in
            this.timings.firstByteAt = process.hrtime();
        });

        // try to get response size from content-length header (cheap)
        let responseSize = response.headers["content-length"];
        if (responseSize !== undefined) {
            responseSize = parseInt(responseSize);
        }
        // ...otherwise count actual response size as its streamed
        if (responseSize === undefined || isNaN(responseSize)) {
            responseSize = 0;
            response.on("data", (chunk) => {
                responseSize += chunk.length;
            });
        }

        response.on("end", () => {
            // all of response body was received
            this.timings.endAt = process.hrtime();

            this.triggerMetrics({
                requestBodySize: this.requestBodySize,
                responseBodySize: responseSize,
                serverRequestId: requestId
            });
        });
    }

    onSocket(socket) {
        this.timings.socketAt = process.hrtime();

        socket.prependListener("lookup", () => {
            this.timings.dnsLookupAt = process.hrtime();
        });

        socket.prependListener("connect", () => {
            this.timings.tcpConnectionAt = process.hrtime();
        });

        socket.prependListener("secureConnect", () => {
            this.timings.tlsHandshakeAt = process.hrtime();
        });
    }

    onError(err) {
        this.timings.errorAt = process.hrtime();

        this.triggerMetrics({
            error: true,
            errorMessage: err.message,
            errorCode: err.code
        });
    }

    onTimeout() {
        this.timings.errorAt = process.hrtime();

        this.triggerMetrics({
            error: true,
            errorMessage: "Connection timed out",
            errorCode: 110 // ETIMEDOUT
        });
    }

    triggerMetrics(extraMetrics) {
        if (!this.metricsTriggered) {
            const metrics = {
                ...this.getRequestMetrics(),
                ...this.getResponseMetrics(),
                ...this.getTimingMetrics(),
                ...extraMetrics
            };
            // console.log(metrics);
            this.metricsCallback(metrics);
            this.metricsTriggered = true;
        }
    }

    getRequestMetrics() {
        const opts = this.httpOptions;
        const req = this.request;

        // different node http frameworks set different values, this code tries to normalize values

        const host = opts.hostname || opts.host || "localhost"
        let domain;
        try {
            // sometimes hostname is set, but sometimes we have to parse href
            domain = (opts.hostname || url.parse(opts.href).hostname).split(".").slice(-2).join(".");
        } catch (ignore) {}

        return {
            protocol: opts.protocol,
            host: host,
            port: opts.port || opts.defaultPort || ((!opts.protocol || opts.protocol === "http:") ? 80 : 443),
            path: opts.path,
            url: opts.href || `${opts.protocol}//${opts.hostname}${opts.port ? ":" + opts.port : ""}${opts.path}`,
            method: req.method || "GET",
            domain: domain
        };
    }

    getResponseMetrics() {
        if (!this.response) {
            return {};
        }

        const res = this.response;

        return {
            responseCode: res.statusCode,
            responseStatus: res.statusMessage,
            contentType: res.headers["content-type"],
            localIPAddress: res.socket.localAddress,
            serverIPAddress: res.socket.remoteAddress
        };
    }

    getTimingMetrics() {
        const t = this.timings;

        // same attribute names as New Relic Synthetics
        // https://docs.newrelic.com/attribute-dictionary?attribute_name=&events_tids%5B%5D=8387
        // total duration (until successful end of response or until error/timeout)
        return {
            duration: getDurationInMs(t.startAt, t.errorAt || t.endAt),
            // time until socket is available
            durationBlocked: getDurationInMs(t.startAt, t.socketAt),
            // time resolving DNS
            durationDNS: getDurationInMs(t.socketAt, t.dnsLookupAt),
            // time establishing TCP connection
            durationConnect: getDurationInMs(t.dnsLookupAt || t.socketAt, t.tcpConnectionAt),
            // time for TLS/SSL handshake on top of TCP connection (only for https)
            durationSSL: getDurationInMs(t.tcpConnectionAt, t.tlsHandshakeAt),
            // time to send HTTP request
            durationSend: getDurationInMs(t.tlsHandshakeAt || t.tcpConnectionAt, t.sentRequestAt),
            // time waiting for first byte of HTTP response
            durationWait: getDurationInMs(t.sentRequestAt, t.firstByteAt),
            // time to receive entire HTTP response
            durationReceive: getDurationInMs(t.firstByteAt, t.endAt)
        };
    }
}

function requestWithMetrics(originalRequestFn, obj, attributes) {
    // the returned function is called in place of node http/s.request()
    return (input, options, callback) => {
        return new HttpRequestMetrics()
            .withRequestFn(originalRequestFn)
            .withArgs(input, options, callback)
            .withMetricsCallback(attributes.metricsCallback)
            .getRequest();
    };
}

function start(metricsCallback) {
    // wrap node http.request() and https.request() functions with custom ones
    // the instrument any http client request
    fnwrap.wrap(http, "request", requestWithMetrics, { metricsCallback });
    fnwrap.wrap(https, "request", requestWithMetrics, { metricsCallback });
}

function stop() {
    // remove wrapped functions and restore originals
    fnwrap.unwrap(http, "request");
    fnwrap.unwrap(https, "request");
}

module.exports = {
    start,
    stop
};
