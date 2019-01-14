import _debounce from 'lodash-es/debounce';
import _forEach from 'lodash-es/forEach';

import { json as d3_json } from 'd3-request';

import { utilQsString } from '../util';


var apibase = 'https://wiki.openstreetmap.org/w/api.php';
var _inflight = {};
var _wikibaseCache = {};
var _localeIDs = { en: false };


var debouncedRequest = _debounce(request, 500, { leading: false });

function request(url, callback) {
    if (_inflight[url]) return;

    _inflight[url] = d3_json(url, function (err, data) {
        delete _inflight[url];
        callback(err, data);
    });
}


/**
 * Get the best string value from the descriptions/labels result
 * Note that if mediawiki doesn't recognize language code, it will return all values.
 * In that case, fallback to use English.
 * @param values object - either descriptions or labels
 * @param langCode String
 * @returns localized string
 */
function localizedToString(values, langCode) {
    if (values) {
        values = values[langCode] || values.en;
    }
    return values ? values.value : '';
}


export default {

    init: function() {
        _inflight = {};
        _wikibaseCache = {};
        _localeIDs = {};
    },


    reset: function() {
        _forEach(_inflight, function(req) { req.abort(); });
        _inflight = {};
    },


    /**
     * Get the best value for the property, or undefined if not found
     * @param entity object from wikibase
     * @param property string e.g. 'P4' for image
     * @param langCode string e.g. 'fr' for French
     */
    claimToValue: function(entity, property, langCode) {
        if (!entity.claims[property]) return undefined;
        var locale = _localeIDs[langCode];
        var preferredPick, localePick;
        _forEach(entity.claims[property], function(stmt) {
            // If exists, use value limited to the needed language (has a qualifier P26 = locale)
            // Or if not found, use the first value with the "preferred" rank
            if (!preferredPick && stmt.rank === 'preferred') {
                preferredPick = stmt;
            }
            if (locale && stmt.qualifiers && stmt.qualifiers.P26 &&
                stmt.qualifiers.P26[0].datavalue.value.id === locale
            ) {
                localePick = stmt;
            }
        });
        var result = localePick || preferredPick;

        if (result) {
            var datavalue = result.mainsnak.datavalue;
            return datavalue.type === 'wikibase-entityid' ? datavalue.value.id : datavalue.value;
        } else {
            return undefined;
        }
    },


    toSitelink: function(key, value) {
        var result = value ? 'Tag:' + key + '=' + value : 'Key:' + key;
        return result.replace(/_/g, ' ').trim();
    },


    getEntity: function(params, callback) {
        var doRequest = params.debounce ? debouncedRequest : request;
        var self = this;
        var titles = [];
        var result = {};
        var keySitelink = this.toSitelink(params.key);
        var tagSitelink = params.value ? this.toSitelink(params.key, params.value) : false;
        var localeSitelink;

        if (params.langCode && _localeIDs[params.langCode] === undefined) {
            // If this is the first time we are asking about this locale,
            // fetch corresponding entity (if it exists), and cache it.
            // If there is no such entry, cache `false` value to avoid re-requesting it.
            localeSitelink = ('Locale:' + params.langCode).replace(/_/g, ' ').trim();
            titles.push(localeSitelink);
        }

        if (_wikibaseCache[keySitelink]) {
            result.key = _wikibaseCache[keySitelink];
        } else {
            titles.push(keySitelink);
        }

        if (tagSitelink) {
            if (_wikibaseCache[tagSitelink]) {
                result.tag = _wikibaseCache[tagSitelink];
            } else {
                titles.push(tagSitelink);
            }
        }

        if (!titles.length) {
            // Nothing to do, we already had everything in the cache
            return callback(null, result);
        }

        // Requesting just the user language code
        // If backend recognizes the code, it will perform proper fallbacks,
        // and the result will contain the requested code. If not, all values are returned:
        // {"zh-tw":{"value":"...","language":"zh-tw","source-language":"zh-hant"}
        // {"pt-br":{"value":"...","language":"pt","for-language":"pt-br"}}
        var obj = {
            action: 'wbgetentities',
            sites: 'wiki',
            titles: titles.join('|'),
            languages: params.langCode,
            languagefallback: 1,
            origin: '*',
            format: 'json',
            // There is an MW Wikibase API bug https://phabricator.wikimedia.org/T212069
            // We shouldn't use v1 until it gets fixed, but should switch to it afterwards
            // formatversion: 2,
        };

        var url = apibase + '?' + utilQsString(obj);
        doRequest(url, function(err, d) {
            if (err) {
                callback(err);
            } else if (!d.success || d.error) {
                callback(d.error.messages.map(function(v) { return v.html['*']; }).join('<br>'));
            } else {
                var localeID = false;
                _forEach(d.entities, function(res) {
                    if (res.missing !== '') {
                        var title = res.sitelinks.wiki.title;
                        // Simplify access to the localized values
                        res.description = localizedToString(res.descriptions, params.langCode);
                        res.label = localizedToString(res.labels, params.langCode);
                        if (title === keySitelink) {
                            _wikibaseCache[keySitelink] = res;
                            result.key = res;
                        } else if (title === tagSitelink) {
                            _wikibaseCache[tagSitelink] = res;
                            result.tag = res;
                        } else if (title === localeSitelink) {
                            localeID = res.id;
                        } else {
                            console.log('Unexpected title ' + title);  // eslint-disable-line no-console
                        }
                    }
                });

                if (localeSitelink) {
                    // If locale ID is not found, store false to prevent repeated queries
                    self.addLocale(params.langCode, localeID);
                }

                callback(null, result);
            }
        });
    },


    addLocale: function(langCode, qid) {
        // Makes it easier to unit test
        _localeIDs[langCode] = qid;
    },

    apibase: function(val) {
        if (!arguments.length) return apibase;
        apibase = val;
        return this;
    }

};
