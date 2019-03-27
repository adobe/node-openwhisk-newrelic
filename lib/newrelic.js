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

const Metrics = require('./metrics');
const request = require('request-promise-native');
const { promisify } = require('util');
const gzip = promisify(require('zlib').gzip);

/**
 * @typedef NewRelicOptions
 * @type {Object}
 * @property {String} url URL pointing to the NewRelic Insert API
 * @property {String} apiKey API key to use with the NewRelic Insert API
 */

/**
 * Transmit metrics to NewRelic 
 */
class NewRelic {

    /**
     * Construct a NewRelic object
     * 
     * @param {NewRelicOptions} options NewRelic options
     */
    constructor(options) {
        this.url = options.url;
        this.apiKey = options.apiKey;
    }

    /**
     * Send an event to NewRelic
     * 
     * @param {String} eventType Event type associated with metrics
     * @param {Object} metrics Metrics to send to NewRelic
     */
    async send(eventType, metrics) {
        try {
            metrics = Object.assign({}, metrics, {
                eventType,
                timestamp: Metrics.timestamp()
            });
            Metrics.openwhisk(metrics);
    
            const json = JSON.stringify(NewRelic.flatten(metrics));
            const body = await gzip(json);
            const response = await request.post(this.url, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Insert-Key': this.apiKey,
                    'Content-Encoding': 'gzip' 
                },
                body
            });
            console.log(`Metrics sent to NewRelic: ${response}`)
        } catch (e) {
            console.error(`Unable to send metrics to NewRelic: ${e.message}`);
        }
    }

    /**
     * Flatten metrics object so it can be sent to NewRelic.
     * 
     * Behavior:
     * - Only owned key/value pairs are returned
     * - Only object, string and number values are supported
     * - Nested objects are flattened by using the "_" separator in the key, e.g. 
     *   "parent_child_child"
     * 
     * @param {Object} metrics Metrics object
     */
    static flatten(metrics, parentKey) {
        parentKey = parentKey || "";
        const result = {};
        for (const { key, value } of Object.entries(metrics)) {
            if (typeof value === "object") {
                Object.assign(result, NewRelic.flatten(value, `${parentKey}${key}_`));
            } else if ((typeof value === "number") || (typeof value === "string")) {
                result[`${parentKey}${key}`] = value;
            } else {
                throw Error(`Unsupported property: ${key}: ${value}`);
            }
        }
        return result;
    }

}

module.exports = {
    NewRelic
}
