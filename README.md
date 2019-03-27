# newrelic-metrics

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

Library for gathering metrics and sending them to NewRelic
