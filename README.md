# node-openwhisk-newrelic

Library for gathering metrics from Apache OpenWhisk actions and sending them to New Relic

## NewRelic Insert API JSON format guidelines

Reference: <https://docs.newrelic.com/docs/insights/insights-data-sources/custom-data/send-custom-events-event-api>

* `eventType` required
* `timestamp` Unix epoch timestamp either in seconds or milliseconds
* Key-value pairs with `float` and `string` values only
* Limits:
  * 255 attributes
  * 255 characters in the attribute name
  * 4KB max length attribute value
  * 100,000 HTTP POST requests/min, 429 status after, counter reset of 1 minute window


## Usage

Instantiate the New Relic Metrics agent
```
const NewRelic = require('@nui/openwhisk-newrelic');
const metrics = new NewRelic({
    newRelicEventsURL: 'https://insights-collector.newrelic.com/v1/accounts/<YOUR_ACOUNT_ID>/events',
    newRelicApiKey: 'YOUR_API_KEY',
});
```

Call start() to start the agent when you are ready to start sending metrics
```
const NewRelic = require('@nui/openwhisk-newrelic');
const metrics = new NewRelic({
    newRelicEventsURL: 'https://insights-collector.newrelic.com/v1/accounts/<YOUR_ACOUNT_ID>/events',
    newRelicApiKey: 'YOUR_API_KEY',
});
metrics.start();
```

Collect all your custom/background metrics in a separate object
```
const customMetrics = {
    data: "value",
    userName: "sampleUser"
}
```

Send your metrics to New Relic
```
await metrics.send('EVENT_TYPE', customMetrics);
```

Call close() to stop the agent when you are finished sending metrics
```
metrics.close();
```
