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

const TIMEOUT_BUFFER = 1000;

function isBlankString(str){
    if(str === null || str === undefined || typeof str !== 'string'){
        return true;
    }
    return (/^\s*$/).test(str);
}

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
     * @param {object} defaultMetrics default metrics to include in every New Relic event
     */
    constructor(options, defaultMetrics={}) {
        this.canSendMetrics = false;
        if (!options ||
            isBlankString(options.newRelicEventsURL) ||
            isBlankString(options.newRelicApiKey)
            ) {
            console.error('Missing NewRelic events Api Key or URL. Metrics disabled.');
        } else {
            this.url = options.newRelicEventsURL;
            this.apiKey = options.newRelicApiKey;
            this.defaultMetrics = defaultMetrics;

            if (options.actionTimeoutMetricsCb && typeof options.actionTimeoutMetricsCb !== 'function') {
                console.error('Action timeout is not a proper function.');
                delete options.actionTimeoutMetricsCb;
            }
            if (!options.disableActionTimeout && !process.env.DISABLE_ACTION_TIMEOUT_METRIC ) {
                this.actionTimeoutHandlerId = sendMetricsOnActionTimeout(this, options.actionTimeoutMetricsCb);
            }

            this.canSendMetrics = true;
        }
    }

    /**
     * End action timeout after client is finished sending metrics
     *
     */
    activationFinished() {
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
            metrics = Object.assign(
                {
                    eventType,
                    timestamp: Metrics.timestamp()
                },
                Metrics.openwhisk(),
                this.defaultMetrics,
                metrics);

            if (!this.canSendMetrics) {
                console.error("Metrics not sent: ", metrics);
                return Promise.resolve();
            }

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
                console.log(`Error sending NewRelic metrics type ${eventType} with status ${response.status}: ${response.statusText}`);
                console.error("Metrics not sent: ", metrics);
            } else {
                console.log(`Metrics type ${eventType} sent to NewRelic: ${JSON.stringify(await response.json())}`)
            }
        } catch (e) {
            console.error(`Unable to send metrics type ${eventType} to NewRelic: ${e.message}`);
            console.error("Metrics not sent: ", metrics);
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
function sendMetricsOnActionTimeout(self, actionTimeoutMetricsCb) {
    return setTimeout(
        async () => {
            let metrics = {};
            if (actionTimeoutMetricsCb) {
                metrics = actionTimeoutMetricsCb();
            }

            console.log(`Action will timeout in ${Metrics.timeUntilTimeout()} milliseconds. Sending metrics before action timeout.`);
            await self.send("timeout", metrics);
            console.log(`Metrics sent before action timeout.`);
        },
        Metrics.timeUntilTimeout() - TIMEOUT_BUFFER
    );
}

module.exports = NewRelic;
