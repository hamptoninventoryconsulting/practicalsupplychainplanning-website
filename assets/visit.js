/**
 * Visit labels for this tab.
 * The landing URL's utm_ values and ref are kept in sessionStorage.
 * A later URL in the same tab that carries utm_ or ref replaces them.
 * A page with none leaves the stored visit as it is.
 * The product checkout and the email form read the URL first, then this store.
 * The /start/plan-ahead/ trial link stays a plain path; this script is the carry.
 * Nothing here is written back into the address bar.
 */
(function (root) {
  "use strict";

  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var STORAGE_KEY = "pscp.visit";
  var MAX = 100;

  function cleanTracked(value, allowDot) {
    if (value == null) {
      return "";
    }
    var text = String(value);
    if (text.indexOf("@") !== -1) {
      return "";
    }
    var pattern = allowDot ? /[^A-Za-z0-9._-]/g : /[^A-Za-z0-9_-]/g;
    return text.replace(pattern, "").slice(0, MAX);
  }

  function cleanUtm(value) {
    return cleanTracked(value, true);
  }

  function cleanRef(value) {
    return cleanTracked(value, false);
  }

  function fromSearch(search) {
    var query = String(search || "");
    if (query.charAt(0) === "?") {
      query = query.slice(1);
    }
    var params = new URLSearchParams(query);
    var found = {};
    var any = false;
    UTM_KEYS.forEach(function (key) {
      var clean = cleanUtm(params.get(key));
      if (clean) {
        found[key] = clean;
        any = true;
      }
    });
    var ref = cleanRef(params.get("ref"));
    if (ref) {
      found.ref = ref;
      any = true;
    }
    return any ? found : null;
  }

  function sanitize(parsed) {
    var found = {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return found;
    }
    UTM_KEYS.forEach(function (key) {
      var clean = cleanUtm(parsed[key]);
      if (clean) {
        found[key] = clean;
      }
    });
    var ref = cleanRef(parsed.ref);
    if (ref) {
      found.ref = ref;
    }
    return found;
  }

  function createVisit(storage, getSearch) {
    function load() {
      if (!storage || typeof storage.getItem !== "function") {
        return {};
      }
      try {
        var raw = storage.getItem(STORAGE_KEY);
        if (!raw) {
          return {};
        }
        return sanitize(JSON.parse(raw));
      } catch (error) {
        return {};
      }
    }

    function capture() {
      var next = fromSearch(getSearch());
      if (!next || !storage || typeof storage.setItem !== "function") {
        return;
      }
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        /* This tab can refuse sessionStorage. The URL is still read. */
      }
    }

    function read() {
      var url = fromSearch(getSearch()) || {};
      var stored = load();
      var out = {};
      UTM_KEYS.forEach(function (key) {
        out[key] = url[key] || stored[key] || "";
      });
      out.ref = url.ref || stored.ref || "";
      return out;
    }

    function customData() {
      var fields = read();
      var data = { campaign: "default" };
      UTM_KEYS.forEach(function (key) {
        if (fields[key]) {
          data[key] = fields[key];
        }
      });
      if (fields.utm_campaign) {
        data.campaign = fields.utm_campaign;
      }
      if (fields.ref) {
        data.ref = fields.ref;
      }
      return data;
    }

    function forSignup() {
      var fields = read();
      function orNull(value) {
        return value ? value : null;
      }
      return {
        source: orNull(fields.utm_source),
        medium: orNull(fields.utm_medium),
        campaign: orNull(fields.utm_campaign),
        term: orNull(fields.utm_term),
        content: orNull(fields.utm_content),
      };
    }

    return {
      capture: capture,
      read: read,
      customData: customData,
      forSignup: forSignup,
    };
  }

  var api = {
    createVisit: createVisit,
    cleanUtm: cleanUtm,
    cleanRef: cleanRef,
    STORAGE_KEY: STORAGE_KEY,
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  function readSessionStorage(target) {
    try {
      return target.sessionStorage;
    } catch (error) {
      /* Some browsers throw on the property itself when storage is blocked. */
      return null;
    }
  }

  if (root && root.document && root.location) {
    var storage = null;
    try {
      storage = readSessionStorage(root);
    } catch (error) {
      storage = null;
    }
    root.pscpVisit = createVisit(storage, function () {
      return root.location.search;
    });
    try {
      root.pscpVisit.capture();
    } catch (error) {
      /* The URL is still read when this tab refuses sessionStorage. */
    }
  }
})(typeof window !== "undefined" ? window : null);
