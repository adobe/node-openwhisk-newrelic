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
 * @property {Functon} actionTimeoutMetricsCb [OPTIONAL] Callback function that
 * is used when action is about to reach timeout
 * @property {Boolean} disableActionTimeout [OPTIONAL] Disable action timeout metrics
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

            if (options.actionTimeoutMetricsCb && typeof options.actionTimeoutMetricsCb !== 'function') {
                console.error('Action timeout is not a proper function.');
                delete options.actionTimeoutMetricsCb;
            }

            this.disableActionTimeout = options.disableActionTimeout;
            this.metricsCallback = options.actionTimeoutMetricsCb;
        }
    }

    /**
     * Start New Relic agent
     *
     * This should be called when ready to start sending metrics
     */
    start(finishingCb=null){
        if (!this.disableActionTimeout) {
            this.actionTimeoutHandlerId = sendMetricsOnActionTimeout(this, this.metricsCallback, finishingCb);
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
     * Behavior:
     * - Add Apache OpenWhisk action metrics (See  `openwhisk` in metrics.js)
     * - Flatten out metrics object (See  `flatten` in metrics.js)
     * - Send metrics to New Relic
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
     * @typedef {Function} ActionTimeoutMetricsCb callback function when the action is about to timeout
     * @returns {Object} metrics object to send along with timeout event
     */
    /**
     * Schedules a timeout event to send to NewRelic when the action times out
     *
     * @param {ActionTimeoutMetricsCb} actionTimeoutMetricsCb Should return a metrics object
     */
    function sendMetricsOnActionTimeout(self, actionTimeoutMetricsCb, finishingCallback) {
        return setTimeout(
            async () => {
                let metrics = {};
                if (actionTimeoutMetricsCb) {
                    metrics = actionTimeoutMetricsCb();
                }

                console.log(`Action will timeout in ${Metrics.timeUntilTimeout()} milliseconds. Sending metrics before action timeout.`);
                await self.send("timeout", metrics);
                console.log(`Metrics sent before action timeout.`);

                if(typeof finishingCallback === 'function'){
                    finishingCallback();
                }
            },
            Metrics.timeUntilTimeout() - TIMEOUT_BUFFER );
    }

module.exports = NewRelic;
