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
 * @property {Function} actionTimeoutMetricsCb [OPTIONAL] Callback function that
 * is used when action is about to reach timeout
 * @property {Boolean} disableActionTimeout [OPTIONAL] Disable action timeout metrics
 * @property {Boolean} sendImmediately [OPTIONAL] If true, send each metric in send()
 * to NewRelic immediately. Defaults to false, meaning metric events are sent in batches
 * after sendIntervalMsec (default 1 min) or activationFinished(), whichever comes first.
 * @property {Number} sendIntervalMsec [OPTIONAL] Interval after which to send metrics
 * in case the activation has not finished yet. Defaults to 1 minute.
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
        this.defaultMetrics = Object.assign(Metrics.openwhisk(), defaultMetrics);

        this.canSendMetrics = false;
        if (!options ||
            isBlankString(options.newRelicEventsURL) ||
            isBlankString(options.newRelicApiKey)
            ) {
            console.error('Missing NewRelic events Api Key or URL. Metrics disabled.');
        } else {
            this.url = options.newRelicEventsURL;
            this.apiKey = options.newRelicApiKey;

            if (options.actionTimeoutMetricsCb && typeof options.actionTimeoutMetricsCb !== 'function') {
                console.error('Action timeout is not a proper function.');
                delete options.actionTimeoutMetricsCb;
            }
            if (!options.disableActionTimeout && !process.env.DISABLE_ACTION_TIMEOUT_METRIC ) {
                this.actionTimeoutHandlerId = sendMetricsOnActionTimeout(this, options.actionTimeoutMetricsCb);
            }

            this.canSendMetrics = true;

            this.sendImmediately = options.sendImmediately;
            this.sendIntervalMsec = options.sendIntervalMsec || 60000; // 1 minute
        }
        this.queuedMetrics = [];
    }

    /**
     * Add custom metrics that will be sent with every following send() of metrics, including
     * the timeout metrics (if enabled). These can be overwritten with metrics passed into
     * the send() method.
     *
     * @param {object} metrics custom metrics to add
     */
    add(metrics) {
        this.defaultMetrics = Object.assign({}, this.defaultMetrics, metrics);
    }

    /**
     * Returns the default metrics and collected metrics from add() invocations.
     *
     * @returns {object} metrics, key value pairs as object members
     */
    get() {
        return this.defaultMetrics;
    }

    /**
     * Call this when the action activation finishes successfully.
     */
    async activationFinished() {
        // send any aggregated metrics
        await sendQueuedMetrics(this);

        // action finished succesfully, there will be no timeout
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
        metrics = Object.assign(
            {
                eventType,
                timestamp: Metrics.timestamp()
            },
            this.defaultMetrics,
            metrics
        );

        if (!this.canSendMetrics) {
            console.error("Metrics not sent: ", metrics);
            return Promise.resolve();
        }

        this.queuedMetrics.push(metrics);

        if (this.sendImmediately) {
            await sendQueuedMetrics(this);
        } else {
            // if not yet scheduled, set timer to ensure we send metrics after sendIntervalMsec latest
            if (!this.sendTimeoutId) {
                this.sendTimeoutId = setTimeout(() => sendQueuedMetrics(this), this.sendIntervalMsec);
            }
        }
    }
}

/**
 * Internal function that sends the aggregated metrics in batches.
 */
async function sendQueuedMetrics(self) {
    // abort if nothing to send
    if (self.queuedMetrics === undefined || self.queuedMetrics.length === 0) {
        return;
    }

    try {
        const array = self.queuedMetrics.map(m => Metrics.flatten(m));
        const response = await fetch(self.url,
            {
                method: 'post',
                headers: {
                    'content-type': 'application/json',
                    'X-Insert-Key': self.apiKey,
                    'Content-Encoding': 'gzip'
                },
                body: await gzip(JSON.stringify(array))
            });
        if (!response.ok) {
            console.log(`Error sending NewRelic metrics with status ${response.status}: ${response.statusText}`);
            console.error("Metrics not sent: ", self.queuedMetrics);
        } else {
            console.log(`Metrics sent to NewRelic, response: ${JSON.stringify(await response.json())}`);
        }

    } catch (e) {
        console.error(`Unable to send metrics to NewRelic: ${e.message}`);
        console.error("Metrics not sent: ", self.queuedMetrics);

    } finally {
        self.queuedMetrics = [];

        // if we had
        if (self.sendTimeoutId) {
            clearTimeout(self.sendTimeoutId);
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
    const timeout = Metrics.timeUntilTimeout();
    return setTimeout(
        async () => {
            let metrics = {
                duration: timeout
            };
            if (actionTimeoutMetricsCb) {
                metrics = actionTimeoutMetricsCb();
            }

            console.log(`Action will timeout in ${Metrics.timeUntilTimeout()} milliseconds. Sending metrics before action timeout.`);
            await self.send("timeout", metrics);
            await sendQueuedMetrics(self);
            console.log(`Metrics sent before action timeout.`);
        },
        Metrics.timeUntilTimeout() - TIMEOUT_BUFFER
    );
}

module.exports = NewRelic;
