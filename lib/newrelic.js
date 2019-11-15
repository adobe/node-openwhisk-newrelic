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
const fetch = require('node-fetch');
const { promisify } = require('util');
const gzip = promisify(require('zlib').gzip);

const TIMEOUT_BUFFER = 100;

/**
 * @typedef NewRelicOptions
 * @type {Object}
 * @property {String} newRelicEventsURL URL pointing to the NewRelic Insert API
 * @property {String} newRelicApiKey API key to use with the NewRelic Insert API
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
        if (!options || !options.newRelicEventsURL || !options.newRelicApiKey) {
            console.error('Missing NewRelic events Api Key or URL. Metrics disabled.'); 
        } else {
            this.url = options.newRelicEventsURL;
            this.apiKey = options.newRelicApiKey;

            if (options.actionTimeoutMetricsCB && typeof options.actionTimeoutMetricsCB !== 'function') {
                console.error('Action timeout is not a proper function.');
                delete options.setActionTimeoutMetricsCB;
            }

            this.actionTimeoutHandlerId = sendMetricsOnActionTimeout(this, options.setActionTimeoutMetricsCB);

        }
    }

    /**
     * End New Relic agent at the end of an Open Whisk action
     *
     * This should be called after all metrics have been sent and the action is finished
     */
    close() {
        clearTimeout(this.actionTimeoutHandlerId);
    }

    /**
     * Send an event to NewRelic
     *
     * @param {String} eventType Event type associated with metrics
     * @param {Object} metrics Metrics to send to NewRelic
     */
    async send(eventType, metrics={}) {
        try {
            metrics = Object.assign({},  Metrics.openwhisk(), {
                eventType,
                timestamp: Metrics.timestamp()
            }, metrics);

            const json = JSON.stringify(Metrics.flatten(metrics));
            const body = await gzip(json);
            const response = await fetch(this.url,
                {
                    method: 'post',
                    headers: {
                        'content-type': 'application/json',
                        'X-Insert-Key': this.apiKey,
                        'Content-Encoding': 'gzip'
                    },
                    body: body
                });
            if (!response.ok) {
                console.log(`Error sending NewRelic metrics with status ${response.status}: ${response.statusText}`);
            } else {
                console.log(`Metrics sent to NewRelic: ${JSON.stringify(await response.json())}`)
            }
        } catch (e) {
            console.error(`Unable to send metrics to NewRelic: ${e.message}`);
        }
    }

}


/**
     * @typedef {Function} ActionTimeoutMetricsCB callback function when the action is about to timeout
     * @returns {Object} metrics object to send along with timeout event
     */
    /**
     * Schedules a timeout event to send to NewRelic when the action times out
     *
     * @param {ActionTimeoutMetricsCB} actionTimeoutMetricsCB Should return a metrics object
     */
    function sendMetricsOnActionTimeout(self, actionTimeoutMetricsCB) {
        return setTimeout(
            async () => {
                let metrics = {};
                if (actionTimeoutMetricsCB) {
                    metrics = actionTimeoutMetricsCB();
                }
    
                console.log(`Action will timeout in ${Metrics.timeUntilTimeout()} milliseconds. Sending metrics before action timeout.`);
                await self.send("timeout", metrics);
                console.log(`Metrics sent before action timeout.`);
            },
            Metrics.timeUntilTimeout() - TIMEOUT_BUFFER );
    }

module.exports = NewRelic;
