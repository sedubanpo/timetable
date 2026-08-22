// [서버 코드] Code.gs - V57 (V40 Original Logic)
var AUTH_SPREADSHEET_ID = "1ByPeH0bZZrZDvW_yPkCpQCIuk724_Gt7uudUj_Ue8Ho";
var MASTER_LOGIN_ID = "010-4232-7428";
var AUTH_CACHE_KEY = "TEACHER_AUTH_V2";
var LOOKUP_LOGIN_ID = "2371";
var LOOKUP_LOGIN_PASSWORD = "2371";
var FIREBASE_PROJECT_ID = "fir-lms-prod";
var FIREBASE_API_KEY = "AIzaSyCFM21ZxgwIYwmjRPaAOp5bL9Kprqiyppg";
var SCHEDULE_START_HOUR = 8;
var SCHEDULE_END_HOUR = 23;
var DASHBOARD_ADMIN_SESSION_PREFIX = "TEACHER_DASHBOARD_ADMIN_SESSION_V1_";
var DASHBOARD_ADMIN_SESSION_TTL_SECONDS = 86400;
var DASHBOARD_ADMIN_SESSION_CACHE_TTL_SECONDS = 21600;
var SCHEDULE_SHEET_NAMES_CACHE_KEY = "SCHEDULE_SHEET_NAMES_V1";
var SCHEDULE_SHEET_NAMES_CACHE_TTL_SECONDS = 300;

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  if (String(params.mode || "").toLowerCase() === "api") {
    return handleApiRequest_(params);
  }
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('에스에듀 반포관 시간표 V60')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setFaviconUrl("https://raw.githubusercontent.com/whdtjd5294/whdtjd5294.github.io/main/sedu_logo.png");
}

function handleApiRequest_(params) {
  try {
    if (!isApiAuthorized_(params)) {
      return jsonOutput_({ ok: false, error: "UNAUTHORIZED" });
    }

    var action = String(params.action || "grid").toLowerCase();
    if (action === "ping") {
      return jsonOutput_({
        ok: true,
        now: new Date().toISOString(),
        tz: Session.getScriptTimeZone() || "Asia/Seoul"
      }, params);
    }

    if (action === "sheets") {
      return jsonOutput_({ ok: true, sheets: getSheetNames() }, params);
    }

    if (action === "auth") {
      var loginId = String(params.id || "").trim();
      var password = String(params.pw || "");
      var idToken = String(params.idToken || "").trim();
      if (idToken) {
        try {
          return jsonOutput_(attachDashboardAdminSession_(authenticateFirebaseTeacher_(idToken)), params);
        } catch (firebaseErr) {
          var firebaseMessage = firebaseErr && firebaseErr.message ? firebaseErr.message : String(firebaseErr || "");
          if (!loginId || !password || /^FIREBASE_BLOCKED:/.test(firebaseMessage)) {
            return jsonOutput_({ ok: false, error: firebaseMessage || "FIREBASE_AUTH_FAILED" }, params);
          }
        }
      }
      if (!loginId || !password) return jsonOutput_({ ok: false, error: "AUTH_REQUIRED" }, params);
      return jsonOutput_(attachDashboardAdminSession_(authenticateTeacher(loginId, password)), params);
    }

    if (action === "teacher_sheets") {
      var selectedTeacher = String(params.teacher || "").trim();
      var teacherRefresh = String(params.refresh || "") === "1";
      if (!selectedTeacher) return jsonOutput_({ ok: false, error: "TEACHER_REQUIRED" }, params);
      return jsonOutput_({ ok: true, sheets: getTeacherSheetNames(selectedTeacher, teacherRefresh) }, params);
    }

    if (action === "teacher_view_log") {
      var logTeacher = String(params.teacher || "").trim();
      var logSheet = String(params.sheet || "").trim();
      var logLoginId = String(params.loginId || "").trim();
      if (!logTeacher || !logSheet) return jsonOutput_({ ok: false, error: "LOG_REQUIRED" }, params);
      if (!logTeacherView_(logTeacher, logSheet, logLoginId)) {
        return jsonOutput_({ ok: false, error: "LOG_SAVE_FAILED" }, params);
      }
      return jsonOutput_({ ok: true }, params);
    }

    if (action === "teacher_view_logs") {
      var filterTeacher = String(params.teacher || "").trim();
      var limit = parseInt(String(params.limit || "120"), 10);
      return jsonOutput_({ ok: true, logs: getTeacherViewLogs_(filterTeacher, limit) }, params);
    }

    if (action === "teacher_view_overrides") {
      var overrideSessionLoginId = getDashboardAdminSessionLogin_(params.adminToken);
      if (!overrideSessionLoginId) return jsonOutput_({ ok: false, error: "DASHBOARD_ADMIN_SESSION_REQUIRED" }, params);
      return jsonOutput_({ ok: true, overrides: getTeacherViewOverrides_() }, params);
    }

    if (action === "teacher_view_override_set") {
      var overrideEditorLoginId = getDashboardAdminSessionLogin_(params.adminToken);
      if (!overrideEditorLoginId) return jsonOutput_({ ok: false, error: "DASHBOARD_ADMIN_SESSION_REQUIRED" }, params);
      var overrideTeacher = String(params.teacher || "").trim();
      var overrideSheet = String(params.sheet || "").trim();
      var overrideState = String(params.state || "").trim().toLowerCase();
      var overrideCount = parseInt(String(params.count || "0"), 10);
      if (!overrideTeacher || !overrideSheet) return jsonOutput_({ ok: false, error: "OVERRIDE_REQUIRED" }, params);
      var override = setTeacherViewOverride_(overrideSheet, overrideTeacher, overrideState, overrideCount, overrideEditorLoginId);
      if (!override) return jsonOutput_({ ok: false, error: "OVERRIDE_SAVE_FAILED" }, params);
      return jsonOutput_({ ok: true, override: override }, params);
    }

    if (action === "student_card_statuses") {
      var statusSheet = String(params.sheet || "").trim();
      if (!statusSheet) return jsonOutput_({ ok: false, error: "SHEET_REQUIRED" }, params);
      return jsonOutput_({ ok: true, statuses: getStudentCardStatuses_(statusSheet) }, params);
    }

    if (action === "student_card_mark") {
      var markSheet = String(params.sheet || "").trim();
      var markStudent = String(params.student || "").trim();
      var markLoginId = String(params.loginId || "").trim();
      var markSent = String(params.sent || "0") === "1";
      if (!markSheet || !markStudent) return jsonOutput_({ ok: false, error: "MARK_REQUIRED" }, params);
      return jsonOutput_({ ok: true, status: setStudentCardSentStatus_(markSheet, markStudent, markSent, markLoginId) }, params);
    }

    if (action === "version") {
      var targetSheet = String(params.sheet || "").trim();
      if (!targetSheet) return jsonOutput_({ ok: false, error: "SHEET_REQUIRED" }, params);
      return jsonOutput_({ ok: true, version: checkDataVersion(targetSheet) }, params);
    }

    if (action === "grid") {
      var sheetName = String(params.sheet || "").trim();
      if (!sheetName) return jsonOutput_({ ok: false, error: "SHEET_REQUIRED" }, params);
      var teacherName = String(params.teacher || "").trim();
      var auditTeacherName = String(params.auditTeacher || "").trim();
      var auditLoginId = String(params.auditLoginId || "").trim();
      var forceRefresh = String(params.refresh || "") === "1";
      var lite = String(params.lite || "1") !== "0";
      var payload = teacherName
        ? getTeacherGridData(sheetName, teacherName, forceRefresh)
        : getFixedGridData(sheetName, forceRefresh);
      if (!payload || payload.error) return jsonOutput_({ ok: false, error: payload && payload.error ? payload.error : "GRID_ERROR" }, params);
      var canonicalAuditTeacher = resolveTeacherViewAuditName_(auditTeacherName, auditLoginId);
      var viewLogged = canonicalAuditTeacher ? logTeacherView_(canonicalAuditTeacher, sheetName, auditLoginId) : false;
      if (lite) payload = toLitePayload_(payload);
      return jsonOutput_({ ok: true, data: payload, viewLogged: viewLogged }, params);
    }

    return jsonOutput_({ ok: false, error: "UNKNOWN_ACTION" }, params);
  } catch (err) {
    return jsonOutput_({ ok: false, error: "API_ERR: " + err.message }, params);
  }
}

function toLitePayload_(payload) {
  var headers = (payload && payload.headers) || [];
  var grid = (payload && payload.grid) || {};
  var rows = [];
  for (var h = SCHEDULE_START_HOUR; h <= SCHEDULE_END_HOUR; h++) {
    var line = grid[h] || [];
    for (var i = 0; i < headers.length; i++) {
      var items = line[i] || [];
      if (!items.length) continue;
      rows.push({
        hour: h,
        room: headers[i],
        items: items
      });
    }
  }
  return {
    headers: headers,
    rows: rows,
    version: payload.version || ""
  };
}

function isApiAuthorized_(params) {
  var requiredToken = "";
  try {
    requiredToken = String(PropertiesService.getScriptProperties().getProperty("SCHEDULE_API_TOKEN") || "").trim();
  } catch (e) {
    requiredToken = "";
  }
  if (!requiredToken) return true;
  return String(params.token || "").trim() === requiredToken;
}

function jsonOutput_(obj, params) {
  var callback = String((params && params.callback) || "").trim();
  if (callback) {
    var safeCallback = callback.replace(/[^\w.$]/g, "");
    var body = safeCallback + "(" + JSON.stringify(obj) + ");";
    return ContentService
      .createTextOutput(body)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function attachDashboardAdminSession_(authResult) {
  if (!authResult || !authResult.ok || !authResult.isMaster) return authResult;
  authResult.dashboardAdminToken = issueDashboardAdminSession_(authResult.loginId);
  return authResult;
}

function issueDashboardAdminSession_(loginId) {
  try {
    var normalizedLoginId = normalizeLoginId_(loginId);
    if (!normalizedLoginId) return "";
    var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    var expiresAt = Date.now() + (DASHBOARD_ADMIN_SESSION_TTL_SECONDS * 1000);
    var key = DASHBOARD_ADMIN_SESSION_PREFIX + token;
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({
      loginId: normalizedLoginId,
      expiresAt: expiresAt
    }));
    CacheService.getScriptCache().put(
      key,
      normalizedLoginId,
      DASHBOARD_ADMIN_SESSION_CACHE_TTL_SECONDS
    );
    cleanupExpiredDashboardAdminSessions_(expiresAt - (DASHBOARD_ADMIN_SESSION_TTL_SECONDS * 1000));
    return token;
  } catch (e) {
    return "";
  }
}

function getDashboardAdminSessionLogin_(token) {
  try {
    var value = String(token || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(value)) return "";
    var key = DASHBOARD_ADMIN_SESSION_PREFIX + value;
    var cachedLoginId = String(CacheService.getScriptCache().get(key) || "").trim();
    if (cachedLoginId) return cachedLoginId;

    var properties = PropertiesService.getScriptProperties();
    var raw = String(properties.getProperty(key) || "").trim();
    if (!raw) return "";
    var session = JSON.parse(raw);
    var loginId = normalizeLoginId_(session && session.loginId);
    var expiresAt = Number(session && session.expiresAt);
    if (!loginId || !isFinite(expiresAt) || expiresAt <= Date.now()) {
      properties.deleteProperty(key);
      return "";
    }
    var remainingSeconds = Math.max(1, Math.min(
      DASHBOARD_ADMIN_SESSION_CACHE_TTL_SECONDS,
      Math.floor((expiresAt - Date.now()) / 1000)
    ));
    CacheService.getScriptCache().put(key, loginId, remainingSeconds);
    return loginId;
  } catch (e) {
    return "";
  }
}

function cleanupExpiredDashboardAdminSessions_(nowMs) {
  try {
    var now = Number(nowMs) || Date.now();
    var properties = PropertiesService.getScriptProperties();
    var all = properties.getProperties();
    Object.keys(all).forEach(function(key) {
      if (key.indexOf(DASHBOARD_ADMIN_SESSION_PREFIX) !== 0) return;
      try {
        var session = JSON.parse(String(all[key] || ""));
        if (!session || Number(session.expiresAt) <= now) properties.deleteProperty(key);
      } catch (e) {
        properties.deleteProperty(key);
      }
    });
  } catch (e) {}
}

function normalizeLoginId_(value) {
  var s = String(value || "").trim();
  var digits = s.replace(/\D/g, "");
  if (digits.length === 11) return digits;
  if (digits.length === 10 && digits.indexOf("10") === 0) return "0" + digits;
  if (digits.length === 8) return digits;
  return s;
}

function buildLoginKeys_(value) {
  var normalized = normalizeLoginId_(value);
  var keys = [normalized];
  var digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) keys.push(digits.slice(-8));
  if (digits.length === 10 && digits.indexOf("10") === 0) {
    keys.push("0" + digits);
    keys.push(digits.slice(-8));
  }
  if (digits.length === 8) keys.push("010" + digits);
  return keys.filter(function(v, idx, arr){ return v && arr.indexOf(v) === idx; });
}

function extractTeacherName_(teacherItem) {
  var text = String(teacherItem || "");
  var withSuffix = text.match(/([가-힣A-Za-z]+)\s*T\b/);
  if (withSuffix && withSuffix[1]) return withSuffix[1].trim();
  var compact = text.match(/([가-힣A-Za-z]+)T/);
  if (compact && compact[1]) return compact[1].trim();
  var token = text.split(/\s+/).pop() || "";
  return token.replace(/T/g, "").trim();
}

function normalizeTeacherName_(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, "")
    .replace(/선생님$/i, "")
    .replace(/T$/i, "")
    .replace(/[·ㆍ•]/g, "")
    .toLowerCase();
}

function sanitizePassword_(value) {
  return String(value || "").replace(/\u00A0/g, " ").trim();
}

function matchesDefaultPassword_(inputPw, loginIdRaw) {
  var input = sanitizePassword_(inputPw);
  var login = String(loginIdRaw || "").trim();
  if (!input || !login) return false;
  if (input === login) return true;

  var inputDigits = input.replace(/\D/g, "");
  var loginDigits = login.replace(/\D/g, "");
  if (!inputDigits || !loginDigits) return false;
  if (inputDigits === loginDigits) return true;
  if (loginDigits.length === 11 && inputDigits === loginDigits.slice(-8)) return true;
  if (loginDigits.length === 10 && loginDigits.indexOf("10") === 0) {
    var fixed = "0" + loginDigits;
    if (inputDigits === fixed || inputDigits === fixed.slice(-8)) return true;
  }
  return false;
}

function looksLikePhoneCredential_(value) {
  var digits = String(value || "").replace(/\D/g, "");
  return digits.length === 8 || digits.length === 10 || digits.length === 11;
}

function matchesPhoneStylePassword_(inputPw, storedPw) {
  var input = sanitizePassword_(inputPw);
  var stored = sanitizePassword_(storedPw);
  if (!input || !stored) return false;
  if (input === stored) return true;
  if (!looksLikePhoneCredential_(stored)) return false;
  return matchesDefaultPassword_(input, stored);
}

function verifyTeacherPassword_(inputPw, storedPw, loginId) {
  var input = sanitizePassword_(inputPw);
  var stored = sanitizePassword_(storedPw);
  var login = String(loginId || "").trim();
  if (!input) return false;
  if (stored && input === stored) return true;
  if (stored && matchesPhoneStylePassword_(input, stored)) return true;
  if (login && matchesDefaultPassword_(input, login)) return true;
  return false;
}

function verifyPasswordForAccount_(account, inputPw) {
  if (!account) return false;
  if (account.password) return sanitizePassword_(inputPw) === account.password;
  return matchesDefaultPassword_(inputPw, account.loginId);
}

function getTeacherAuthData_(forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get(AUTH_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  }

  var authSS = SpreadsheetApp.openById(AUTH_SPREADSHEET_ID);
  var sheet = authSS.getSheetByName("Teachers");
  if (!sheet) sheet = authSS.getSheets()[0];
  var values = sheet.getDataRange().getDisplayValues();
  var byId = {};
  var teacherNames = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var loginIdRaw = row[0] || "";
    var teacherName = (row[1] || "").trim();
    var pw = sanitizePassword_(row[6]);
    if (!loginIdRaw) continue;

    var account = {
      loginId: String(loginIdRaw).trim(),
      teacherName: teacherName,
      password: pw,
      isMaster: normalizeLoginId_(loginIdRaw) === normalizeLoginId_(MASTER_LOGIN_ID)
    };
    buildLoginKeys_(loginIdRaw).forEach(function(key) {
      byId[key] = account;
    });

    if (teacherName && teacherNames.indexOf(teacherName) === -1) teacherNames.push(teacherName);
  }

  teacherNames.sort();
  var result = { byId: byId, teacherNames: teacherNames };
  cache.put(AUTH_CACHE_KEY, JSON.stringify(result), 300);
  return result;
}

function parseFirestoreValue_(value) {
  if (!value || typeof value !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return String(value.stringValue || "");
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue === true;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue || 0);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue || 0);
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return String(value.timestampValue || "");
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (value.arrayValue) {
    var items = (value.arrayValue && value.arrayValue.values) || [];
    return items.map(function(item) { return parseFirestoreValue_(item); });
  }
  if (value.mapValue) return parseFirestoreFields_((value.mapValue && value.mapValue.fields) || {});
  return undefined;
}

function parseFirestoreFields_(fields) {
  var result = {};
  fields = fields || {};
  Object.keys(fields).forEach(function(key) {
    result[key] = parseFirestoreValue_(fields[key]);
  });
  return result;
}

function fetchFirebaseDocument_(idToken, collection, docId) {
  if (!docId) return {};
  var url = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(FIREBASE_PROJECT_ID) +
    "/databases/(default)/documents/" + encodeURIComponent(collection) + "/" + encodeURIComponent(docId);
  var response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + idToken },
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code === 404) return {};
  if (code < 200 || code >= 300) {
    throw new Error("FIREBASE_PROFILE_FETCH_FAILED");
  }
  var payload = JSON.parse(response.getContentText() || "{}");
  return parseFirestoreFields_(payload.fields || {});
}

function asString_(value) {
  return String(value == null ? "" : value).trim();
}

function asRecord_(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readFirebaseTeacherNames_(loginId) {
  try {
    return getLegacyTeacherNamesForAuth_(loginId);
  } catch (e) {
    return [];
  }
}

function getLegacyTeacherNamesForAuth_(loginId) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "LEGACY_TEACHER_NAMES_FOR_AUTH_V3_ALL";
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  var ss = SpreadsheetApp.openById(AUTH_SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Teachers");
  if (!sheet) sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  var teacherNames = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][1] || "").trim();
    if (name && teacherNames.indexOf(name) === -1) teacherNames.push(name);
  }
  teacherNames.sort();
  cache.put(cacheKey, JSON.stringify(teacherNames), 300);
  return teacherNames;
}

function authenticateFirebaseTeacher_(idToken) {
  var lookupUrl = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(FIREBASE_API_KEY);
  var response = UrlFetchApp.fetch(lookupUrl, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ idToken: idToken }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var body = response.getContentText() || "{}";
  if (code < 200 || code >= 300) {
    throw new Error("FIREBASE_AUTH_FAILED");
  }
  var lookup = JSON.parse(body);
  var user = lookup && lookup.users && lookup.users[0];
  if (!user || !user.localId) throw new Error("FIREBASE_AUTH_FAILED");
  if (user.disabled === true) throw new Error("FIREBASE_BLOCKED: 비활성화된 Firebase 계정입니다.");

  var uid = String(user.localId || "").trim();
  var email = String(user.email || "").trim();
  var userDoc = fetchFirebaseDocument_(idToken, "users", uid);
  var profileDoc = fetchFirebaseDocument_(idToken, "userProfiles", uid);
  var accessDoc = fetchFirebaseDocument_(idToken, "userAppAccess", uid);
  var apps = asRecord_(accessDoc.apps);
  var permissions = asRecord_(accessDoc.permissions);
  var rawRole = asString_(userDoc.role || profileDoc.role || accessDoc.role || "INSTRUCTOR").toUpperCase();
  var status = asString_(userDoc.status || profileDoc.status || "ACTIVE").toUpperCase();

  if (status === "DISABLED" || rawRole === "DISABLED") {
    throw new Error("FIREBASE_BLOCKED: 비활성화된 계정입니다.");
  }
  if (Object.prototype.hasOwnProperty.call(apps, "liveTimetable") && apps.liveTimetable === false) {
    throw new Error("FIREBASE_BLOCKED: 라이브 시간표 접근 권한이 없습니다.");
  }

  var loginId = asString_(userDoc.loginId || profileDoc.instructorId || "");
  if (!loginId && email.indexOf("@sedu-auth.local") > -1) loginId = email.split("@")[0];
  var teacherName = asString_(userDoc.name || profileDoc.displayName || accessDoc.instructorName || "");
  if (!teacherName && email) teacherName = email.split("@")[0];
  var normalizedLoginId = normalizeLoginId_(loginId);
  var isMaster = rawRole === "ADMIN" ||
    permissions.canManageAccounts === true ||
    permissions.canManageSchedules === true ||
    normalizeLoginId_(normalizedLoginId) === normalizeLoginId_(MASTER_LOGIN_ID);

  return {
    ok: true,
    success: true,
    authSource: "firebase",
    firebaseUid: uid,
    loginId: normalizedLoginId || uid,
    teacherName: teacherName,
    name: teacherName,
    isMaster: isMaster,
    isLookup: false,
    role: isMaster ? "ADMIN" : "TEACHER",
    teacherNames: readFirebaseTeacherNames_(normalizedLoginId)
  };
}

function authenticateTeacher(id, password) {
  var sheetId = "1ByPeH0bZZrZDvW_yPkCpQCIuk724_Gt7uudUj_Ue8Ho";
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName("Teachers");
  if (!sheet) sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  var teacherNames = [];
  var matchedAccount = null;

  // 입력 아이디 정규화 (- 제거, 8자리일 경우 010 추가)
  var inputIdClean = String(id).replace(/[^0-9]/g, "");
  if (inputIdClean.length === 8) inputIdClean = "010" + inputIdClean;
  var inputPw = sanitizePassword_(password);

  if (String(id || "").trim() === LOOKUP_LOGIN_ID && inputPw === LOOKUP_LOGIN_PASSWORD) {
    return {
      ok: true,
      success: true,
      loginId: LOOKUP_LOGIN_ID,
      teacherName: "",
      name: "조회용",
      isMaster: false,
      isLookup: true,
      role: "LOOKUP",
      teacherNames: []
    };
  }

  for (var i = 1; i < data.length; i++) {
    var dbId = String(data[i][0]).replace(/[^0-9]/g, "");
    if (!dbId) continue;
    if (dbId.length === 8) dbId = "010" + dbId;

    var dbName = String(data[i][1]).trim();
    if (dbName && teacherNames.indexOf(dbName) === -1) teacherNames.push(dbName);
    var dbPw = sanitizePassword_(data[i][6]);
    // 비밀번호 공란 시 아이디(dbId)로 대체
    if (dbPw === "") dbPw = dbId;
    // 검증 및 권한 부여
    if (!matchedAccount && inputIdClean === dbId && verifyTeacherPassword_(inputPw, dbPw, dbId)) {
      matchedAccount = {
        loginId: inputIdClean,
        teacherName: dbName
      };
    }
  }
  if (matchedAccount) {
    var isMaster = inputIdClean === "01042327428";
    teacherNames.sort();
    return {
      ok: true,
      success: true,
      loginId: matchedAccount.loginId,
      teacherName: matchedAccount.teacherName,
      name: matchedAccount.teacherName,
      isMaster: isMaster,
      isLookup: false,
      role: isMaster ? "ADMIN" : "TEACHER",
      teacherNames: teacherNames
    };
  }
  return { ok: false, success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
}

function getTeacherGridData(sheetName, teacherName, forceRefresh) {
  try {
    var selectedTeacherRaw = String(teacherName || "").trim();
    var selectedTeacher = normalizeTeacherName_(selectedTeacherRaw);
    if (!selectedTeacher) return getFixedGridData(sheetName, forceRefresh);

    var cache = CacheService.getScriptCache();
    var cacheKey = "TEACHER_GRID_V5_" + sheetName + "_" + selectedTeacher;
    if (!forceRefresh) {
      var cached = cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    var base = getFixedGridData(sheetName, forceRefresh);
    if (!base || base.error) return base;

    var filtered = {};
    for (var h = SCHEDULE_START_HOUR; h <= SCHEDULE_END_HOUR; h++) {
      var row = base.grid[h] || [];
      filtered[h] = row.map(function(items) {
        var list = items || [];
        var teacherItem = list.find(function(item) { return String(item || "").includes("T"); });
        if (!teacherItem) return [];
        var name = normalizeTeacherName_(extractTeacherName_(teacherItem));
        if (name !== selectedTeacher) return [];
        return list;
      });
    }

    var result = {
      headers: base.headers || [],
      grid: filtered,
      version: String(base.version || "") + "_T_" + selectedTeacherRaw
    };
    cache.put(cacheKey, JSON.stringify(result), 120);
    return result;
  } catch (e) {
    return { error: "TEACHER_GRID_ERR: " + e.message };
  }
}

function teacherGridHasItems_(payload) {
  var headers = (payload && payload.headers) || [];
  var grid = (payload && payload.grid) || {};
  for (var h = SCHEDULE_START_HOUR; h <= SCHEDULE_END_HOUR; h++) {
    var row = grid[h] || [];
    for (var i = 0; i < headers.length; i++) {
      if (row[i] && row[i].length) return true;
    }
  }
  return false;
}

function getTeacherSheetNames(teacherName, forceRefresh) {
  try {
    var selectedTeacher = normalizeTeacherName_(teacherName);
    if (!selectedTeacher) return getSheetNames();

    var cache = CacheService.getScriptCache();
    var cacheKey = "TEACHER_SHEETS_V2_" + selectedTeacher;
    if (!forceRefresh) {
      var cached = cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    var names = getSheetNames();
    var filtered = names.filter(function(sheetName) {
      if (String(sheetName || "").indexOf("사본") !== -1) return false;
      var data = getTeacherGridData(sheetName, selectedTeacher, forceRefresh);
      return data && !data.error && teacherGridHasItems_(data);
    });
    cache.put(cacheKey, JSON.stringify(filtered), 120);
    return filtered;
  } catch (e) {
    return [];
  }
}

function getTeacherViewLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("강사열람로그");
  if (!sheet) {
    sheet = ss.insertSheet("강사열람로그");
    sheet.getRange(1, 1, 1, 4).setValues([["열람시각", "강사명", "일자시트", "로그인ID"]]);
    if (ss.getSheets().length > 1) sheet.hideSheet();
  }
  return sheet;
}

function resolveTeacherViewAuditName_(requestedTeacherName, loginId) {
  var requested = String(requestedTeacherName || "").trim();
  var login = String(loginId || "").trim();
  if (!login) return "";
  try {
    var authData = getTeacherAuthData_(false);
    var account = null;
    buildLoginKeys_(login).some(function(key) {
      if (authData && authData.byId && authData.byId[key]) {
        account = authData.byId[key];
        return true;
      }
      return false;
    });
    if (!account || account.isMaster) return "";
    var canonical = String(account.teacherName || "").trim();
    if (canonical) return canonical;
    return requested;
  } catch (e) {}
  return "";
}

function logTeacherView_(teacherName, sheetName, loginId) {
  try {
    var teacher = String(teacherName || "").trim();
    var sheet = String(sheetName || "").trim();
    if (!teacher || !sheet) return false;
    var logSheet = getTeacherViewLogSheet_();
    var tz = Session.getScriptTimeZone() || "Asia/Seoul";
    var timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
    logSheet.appendRow([timestamp, teacher, sheet, String(loginId || "").trim()]);
    return true;
  } catch (e) {
    return false;
  }
}

function getTeacherViewLogs_(teacherName, limit) {
  try {
    var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("강사열람로그");
    if (!logSheet) return [];
    var values = logSheet.getDataRange().getDisplayValues();
    if (!values || values.length <= 1) return [];
    var selectedTeacher = String(teacherName || "").trim();
    var maxRows = Math.max(1, Math.min(parseInt(limit, 10) || 120, 300));
    var rows = values.slice(1).filter(function(row) {
      if (!selectedTeacher) return true;
      return String((row && row[1]) || "").trim() === selectedTeacher;
    });
    return rows.slice(-maxRows).reverse().map(function(row) {
      return {
        viewedAt: String((row && row[0]) || ""),
        teacherName: String((row && row[1]) || ""),
        sheetName: String((row && row[2]) || ""),
        loginId: String((row && row[3]) || "")
      };
    });
  } catch (e) {
    return [];
  }
}

function getTeacherViewOverrideSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("강사열람집계수정");
  if (!sheet) {
    sheet = ss.insertSheet("강사열람집계수정");
    sheet.getRange(1, 1, 1, 6).setValues([["일자시트", "강사명", "상태", "열람횟수", "수정시각", "수정자"]]);
    if (ss.getSheets().length > 1) sheet.hideSheet();
  }
  return sheet;
}

function normalizeTeacherViewOverrideKey_(sheetName, teacherName) {
  return String(sheetName || "").trim() + "\u0000" + normalizeTeacherName_(teacherName);
}

function sanitizeTeacherViewOverrideState_(state) {
  var value = String(state || "").trim().toLowerCase();
  return value === "viewed" || value === "missing" || value === "auto" ? value : "";
}

function getTeacherViewOverrides_() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("강사열람집계수정");
    if (!sheet || sheet.getLastRow() <= 1) return [];
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getDisplayValues();
    var newestByKey = {};
    rows.forEach(function(row) {
      var sheetName = String((row && row[0]) || "").trim();
      var teacherName = String((row && row[1]) || "").trim();
      var state = sanitizeTeacherViewOverrideState_((row && row[2]) || "");
      if (!sheetName || !teacherName || !state) return;
      var count = Math.max(0, Math.min(99, parseInt(String((row && row[3]) || "0"), 10) || 0));
      newestByKey[normalizeTeacherViewOverrideKey_(sheetName, teacherName)] = {
        sheetName: sheetName,
        teacherName: teacherName,
        state: state,
        count: state === "viewed" ? Math.max(1, count) : 0,
        updatedAt: String((row && row[4]) || "").trim(),
        updatedBy: String((row && row[5]) || "").trim()
      };
    });
    return Object.keys(newestByKey).map(function(key) { return newestByKey[key]; }).filter(function(item) {
      return item.state !== "auto";
    });
  } catch (e) {
    return [];
  }
}

function setTeacherViewOverride_(sheetName, teacherName, state, count, editorLoginId) {
  var targetSheetName = String(sheetName || "").trim();
  var targetTeacherName = String(teacherName || "").trim();
  var targetState = sanitizeTeacherViewOverrideState_(state);
  var targetCount = Math.max(0, Math.min(99, parseInt(count, 10) || 0));
  if (!targetSheetName || !targetTeacherName || !targetState) return null;
  if (targetState === "viewed" && targetCount < 1) return null;
  if (targetState !== "viewed") targetCount = 0;

  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(5000);
    var sheet = getTeacherViewOverrideSheet_();
    var lastRow = sheet.getLastRow();
    var targetKey = normalizeTeacherViewOverrideKey_(targetSheetName, targetTeacherName);
    var writeRow = 0;
    if (lastRow > 1) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
      for (var i = rows.length - 1; i >= 0; i--) {
        if (normalizeTeacherViewOverrideKey_(rows[i][0], rows[i][1]) === targetKey) {
          writeRow = i + 2;
          break;
        }
      }
    }
    if (!writeRow) writeRow = lastRow + 1;
    var tz = Session.getScriptTimeZone() || "Asia/Seoul";
    var updatedAt = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
    var editor = normalizeLoginId_(editorLoginId);
    sheet.getRange(writeRow, 1, 1, 6).setValues([[targetSheetName, targetTeacherName, targetState, targetCount, updatedAt, editor]]);
    return {
      sheetName: targetSheetName,
      teacherName: targetTeacherName,
      state: targetState,
      count: targetCount,
      updatedAt: updatedAt,
      updatedBy: editor
    };
  } catch (e) {
    return null;
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function getStudentCardStatusSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("학생카드발송로그");
  if (!sheet) {
    sheet = ss.insertSheet("학생카드발송로그");
    sheet.getRange(1, 1, 1, 6).setValues([["일자시트", "학생명", "발송여부", "수정시각", "수정자", "상태키"]]);
    if (ss.getSheets().length > 1) sheet.hideSheet();
  }
  return sheet;
}

function buildStudentCardStatusKey_(sheetName, studentName) {
  return String(sheetName || "").trim() + "||" + String(studentName || "").trim();
}

function getStudentCardStatuses_(sheetName) {
  try {
    var targetSheet = String(sheetName || "").trim();
    if (!targetSheet) return {};
    var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("학생카드발송로그");
    if (!logSheet) return {};
    var values = logSheet.getDataRange().getDisplayValues();
    if (!values || values.length <= 1) return {};
    var statuses = {};
    values.slice(1).forEach(function(row) {
      var rowSheet = String((row && row[0]) || "").trim();
      var student = String((row && row[1]) || "").trim();
      if (!rowSheet || !student || rowSheet !== targetSheet) return;
      statuses[student] = {
        studentName: student,
        sent: String((row && row[2]) || "") === "1",
        updatedAt: String((row && row[3]) || ""),
        updatedBy: String((row && row[4]) || "")
      };
    });
    return statuses;
  } catch (e) {
    return {};
  }
}

function setStudentCardSentStatus_(sheetName, studentName, sent, loginId) {
  var targetSheet = String(sheetName || "").trim();
  var student = String(studentName || "").trim();
  if (!targetSheet || !student) return null;

  var logSheet = getStudentCardStatusSheet_();
  var values = logSheet.getDataRange().getDisplayValues();
  var key = buildStudentCardStatusKey_(targetSheet, student);
  var tz = Session.getScriptTimeZone() || "Asia/Seoul";
  var timestamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
  var payload = [targetSheet, student, sent ? "1" : "0", timestamp, String(loginId || "").trim(), key];
  var foundRow = 0;

  for (var r = 1; r < values.length; r++) {
    var rowKey = String((values[r] && values[r][5]) || "").trim();
    if (!rowKey) {
      rowKey = buildStudentCardStatusKey_(values[r][0], values[r][1]);
    }
    if (rowKey === key) {
      foundRow = r + 1;
      break;
    }
  }

  if (foundRow) logSheet.getRange(foundRow, 1, 1, payload.length).setValues([payload]);
  else logSheet.appendRow(payload);

  return {
    studentName: student,
    sent: !!sent,
    updatedAt: timestamp,
    updatedBy: String(loginId || "").trim()
  };
}

function getSheetNames() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(SCHEDULE_SHEET_NAMES_CACHE_KEY);
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (cacheError) {}
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var names = ss.getSheets()
      .map(function(s) { return s.getName(); })
      .filter(function(n) { 
        return !n.includes("-엑세스") && !n.includes("업무") && !n.includes("데이터") && !n.includes("@") && (n.match(/\d/) !== null); 
      });
    if (names.length) cache.put(SCHEDULE_SHEET_NAMES_CACHE_KEY, JSON.stringify(names), SCHEDULE_SHEET_NAMES_CACHE_TTL_SECONDS);
    return names;
  } catch (e) { return ["ERROR: " + e.message]; }
}

function checkDataVersion(sheetName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = sheetName ? ss.getSheetByName(sheetName) : null;
    if (!sheet) return "ERROR";
    return sheet.getLastRow() + "_" + sheet.getLastColumn() + "_" + sheet.getRange(1,1).getValue();
  } catch (e) { return "ERROR"; }
}

function parseScheduleStartHour_(timeText) {
  var text = String(timeText || "").trim();
  var match = text.match(/(\d{1,2})\s*:/);
  if (!match) return null;

  // 시간 범위의 종료 표시는 별도 행에 "~ 9:00"처럼 들어온다.
  // 이를 새 시작 시각으로 해석하면 오후 학생이 오전 슬롯으로 이동한다.
  var rangeMarkerIndex = text.indexOf("~");
  if (rangeMarkerIndex !== -1 && rangeMarkerIndex < match.index) return null;

  var rawHour = parseInt(match[1], 10);
  var startContext = text.slice(0, match.index + match[0].length);
  var amIndex = startContext.lastIndexOf("오전");
  var pmIndex = startContext.lastIndexOf("오후");
  if (pmIndex > amIndex && rawHour < 12) rawHour += 12;
  if (amIndex > pmIndex && rawHour === 12) rawHour = 0;
  return rawHour;
}

function getFixedGridData(sheetName, forceRefresh) {
  try {
    var cache = CacheService.getScriptCache();
    // [중요] 캐시 키 V63: 분리된 종료 시각 행의 오전/오후 오배치 수정
    var cacheKey = "SHEET_DATA_V63_" + sheetName;

    if (!forceRefresh) {
      var cachedJSON = cache.get(cacheKey);
      if (cachedJSON) return JSON.parse(cachedJSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = sheetName ? ss.getSheetByName(sheetName) : null;
    if (!sheet) return { error: "시트를 찾을 수 없습니다." };

    // V40 로직 그대로 사용 (getDisplayValues 사용)
    var values = sheet.getDataRange().getDisplayValues();
    if (!values || values.length === 0) return { headers: [], grid: {}, version: 0 };

    var headerRowIndex = -1;
    for (var i = 0; i < Math.min(20, values.length); i++) {
      var rowStr = values[i].join("");
      if (rowStr.includes("강의실") || rowStr.includes("1관") || rowStr.includes("2관")) {
        headerRowIndex = i; break;
      }
    }
    if (headerRowIndex === -1) headerRowIndex = values.length > 1 ? 1 : 0;

    var headerRow = values[headerRowIndex];
    var classrooms = []; 
    for (var col = 1; col < headerRow.length; col++) {
      var cellText = headerRow[col].trim();
      if (cellText !== "") {
        if (classrooms.length > 0 && classrooms[classrooms.length - 1].name === cellText) {
        } else {
           if (classrooms.length > 0) classrooms[classrooms.length - 1].endCol = col - 1;
           classrooms.push({ name: cellText, startCol: col, endCol: col });
        }
      }
    }
    if (classrooms.length > 0) classrooms[classrooms.length - 1].endCol = headerRow.length - 1;

    var gridData = {}; 
    for (var h = SCHEDULE_START_HOUR; h <= SCHEDULE_END_HOUR; h++) gridData[h] = classrooms.map(function() { return []; });

    var currentHour = -1; 
    var skipKeywords = ["개학시간표","개학","필드","주말","질문","클리닉","휴식","직전"];
    var moveNoticePattern = /(시간|반|자리|교실)\s*이동|이동\s*(예정|완료|요청)/;
    var datePattern = /\d+\/\d+/; 

    for (var i = headerRowIndex + 1; i < values.length; i++) {
      var row = values[i];
      var timeText = row[0] ? row[0].trim() : "";
      if (timeText.includes(":")) {
        var rawHour = parseScheduleStartHour_(timeText);
        if (rawHour !== null) {
          currentHour = rawHour >= SCHEDULE_START_HOUR && rawHour <= SCHEDULE_END_HOUR ? rawHour : -1;
        }
      }
      if (currentHour >= SCHEDULE_START_HOUR && currentHour <= SCHEDULE_END_HOUR) {
        classrooms.forEach(function(room, roomIndex) {
          var parts = [];
          var firstNonEmptyCol = -1;
          for (var c = room.startCol; c <= room.endCol; c++) {
            var val = row[c] ? row[c].trim() : "";
            if (!val || val.startsWith("/")) continue; 
            if (firstNonEmptyCol === -1) firstNonEmptyCol = c;
            var isHolidayCol = room.name.includes("휴강");
            if (!isHolidayCol) {
               if (datePattern.test(val)) {
                 var hasImportant = /(결석|지각|보강|보충|병결|당일취소|휴강|확인|확정|첫수업|신규|오늘만|특강|직보|자습|등원|분|지각예정)/.test(val);
                 if (!hasImportant) continue;
               }
               if (skipKeywords.some(function(k) { 
                 return val.includes(k) 
                   && !val.includes("확인필요") 
                   && !val.includes("결석예고")
                   && !val.includes("첫수업")
                   && !val.includes("신규")
                   && !val.includes("당일취소");
               })) continue;
               if (moveNoticePattern.test(val)
                 && !val.includes("확인필요")
                 && !val.includes("결석예고")
                 && !val.includes("첫수업")
                 && !val.includes("신규")
                 && !val.includes("당일취소")) continue;
            }
            parts.push(val);
            if (!isHolidayCol && parts.length >= 5) {
              break;
            }
          }
          // 병합 폭이 넓은 헤더에서 인접 강의실 값이 뒤쪽 컬럼으로 섞이는 경우를 방지한다.
          // 실제 해당 강의실 데이터는 보통 시작 컬럼 부근에서 바로 시작한다.
          if (firstNonEmptyCol !== -1 && (firstNonEmptyCol - room.startCol) > 2) {
            return;
          }
          if (parts.length > 0) {
            var combinedText = parts.join(" "); 
            if (!gridData[currentHour][roomIndex].includes(combinedText)) {
              gridData[currentHour][roomIndex].push(combinedText);
            }
          }
        });
      }
    }
    var result = {
      headers: classrooms.map(function(c) { return c.name; }),
      grid: gridData,
      version: sheet.getLastRow() + "_" + sheet.getLastColumn() + "_" + sheet.getRange(1, 1).getDisplayValue()
    };
    try { cache.put(cacheKey, JSON.stringify(result), 21600); } catch (e) {}
    return result;
  } catch (e) { return { error: "SERVER_ERR: " + e.message }; }
}
