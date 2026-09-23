/* Generated from Rust DTOs. Do not edit. */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});
var validateProtocolRequest = validate93;
var schema64 = { "oneOf": [{ "additionalProperties": false, "properties": { "buildId": { "type": "string" }, "expectedProtocolVersion": { "maximum": 4294967295, "minimum": 0, "type": "integer" }, "expectedSchemaVersion": { "maximum": 4294967295, "minimum": 0, "type": "integer" }, "kind": { "const": "initialize", "type": "string" } }, "required": ["kind", "buildId", "expectedProtocolVersion", "expectedSchemaVersion"], "type": "object" }, { "additionalProperties": false, "properties": { "context": { "$ref": "#/definitions/BootstrapContext" }, "kind": { "const": "activateProject", "type": "string" } }, "required": ["kind", "context"], "type": "object" }, { "additionalProperties": false, "properties": { "formatRequests": { "items": { "$ref": "#/definitions/FieldFormatRequest" }, "type": "array" }, "input": { "$ref": "#/definitions/NormalizeInputDto" }, "kind": { "const": "normalizeInput", "type": "string" }, "priorInputDigest": { "type": ["string", "null"] } }, "required": ["kind", "input", "priorInputDigest", "formatRequests"], "type": "object" }, { "additionalProperties": false, "properties": { "kind": { "const": "evaluateProbe", "type": "string" }, "probe": { "$ref": "#/definitions/BootstrapProbeDto" } }, "required": ["kind", "probe"], "type": "object" }, { "additionalProperties": false, "properties": { "kind": { "const": "disposeProject", "type": "string" } }, "required": ["kind"], "type": "object" }], "title": "Command" };
var schema27 = { "enum": ["mm", "cm"], "title": "Unit", "type": "string" };
function validate63(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.fieldPath === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "fieldPath" }, message: "must have required property 'fieldPath'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.unit === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unit" }, message: "must have required property 'unit'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "fieldPath" || key0 === "unit")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.fieldPath !== void 0) {
      if (typeof data.fieldPath !== "string") {
        const err3 = { instancePath: instancePath + "/fieldPath", schemaPath: "#/properties/fieldPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.unit !== void 0) {
      let data1 = data.unit;
      if (typeof data1 !== "string") {
        const err4 = { instancePath: instancePath + "/unit", schemaPath: "#/definitions/Unit/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if (!(data1 === "mm" || data1 === "cm")) {
        const err5 = { instancePath: instancePath + "/unit", schemaPath: "#/definitions/Unit/enum", keyword: "enum", params: { allowedValues: schema27.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
  } else {
    const err6 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
  }
  validate63.errors = vErrors;
  return errors === 0;
}
var schema23 = { "enum": ["notMeasured", "notProvided", "sourceMissing", "conflictingSources"], "title": "UnknownReason", "type": "string" };
var schema18 = { "additionalProperties": false, "properties": { "evidenceIds": { "items": { "type": "string" }, "type": "array" }, "inputRefs": { "items": { "$ref": "#/definitions/FieldRef" }, "type": "array" }, "observedAt": { "type": ["string", "null"] }, "origin": { "$ref": "#/definitions/MeasurementOrigin" }, "ruleIds": { "items": { "type": "string" }, "type": "array" }, "verification": { "$ref": "#/definitions/VerificationStatus" } }, "required": ["origin", "verification", "evidenceIds", "ruleIds", "inputRefs", "observedAt"], "title": "Provenance", "type": "object" };
var schema20 = { "enum": ["synthetic", "manufacturer", "retailer", "userMeasured", "userDeclared", "aiEstimated", "derived"], "title": "MeasurementOrigin", "type": "string" };
var schema21 = { "enum": ["unverified", "estimated", "confirmed"], "title": "VerificationStatus", "type": "string" };
function validate16(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.origin === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "origin" }, message: "must have required property 'origin'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.verification === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "verification" }, message: "must have required property 'verification'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.evidenceIds === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "evidenceIds" }, message: "must have required property 'evidenceIds'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.ruleIds === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "ruleIds" }, message: "must have required property 'ruleIds'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.inputRefs === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputRefs" }, message: "must have required property 'inputRefs'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.observedAt === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "observedAt" }, message: "must have required property 'observedAt'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "evidenceIds" || key0 === "inputRefs" || key0 === "observedAt" || key0 === "origin" || key0 === "ruleIds" || key0 === "verification")) {
        const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.evidenceIds !== void 0) {
      let data0 = data.evidenceIds;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (typeof data0[i0] !== "string") {
            const err7 = { instancePath: instancePath + "/evidenceIds/" + i0, schemaPath: "#/properties/evidenceIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
      } else {
        const err8 = { instancePath: instancePath + "/evidenceIds", schemaPath: "#/properties/evidenceIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.inputRefs !== void 0) {
      let data2 = data.inputRefs;
      if (Array.isArray(data2)) {
        const len1 = data2.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data3 = data2[i1];
          if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
            if (data3.entityId === void 0) {
              const err9 = { instancePath: instancePath + "/inputRefs/" + i1, schemaPath: "#/definitions/FieldRef/required", keyword: "required", params: { missingProperty: "entityId" }, message: "must have required property 'entityId'" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (data3.fieldPath === void 0) {
              const err10 = { instancePath: instancePath + "/inputRefs/" + i1, schemaPath: "#/definitions/FieldRef/required", keyword: "required", params: { missingProperty: "fieldPath" }, message: "must have required property 'fieldPath'" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            for (const key1 in data3) {
              if (!(key1 === "entityId" || key1 === "fieldPath")) {
                const err11 = { instancePath: instancePath + "/inputRefs/" + i1, schemaPath: "#/definitions/FieldRef/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
            if (data3.entityId !== void 0) {
              if (typeof data3.entityId !== "string") {
                const err12 = { instancePath: instancePath + "/inputRefs/" + i1 + "/entityId", schemaPath: "#/definitions/FieldRef/properties/entityId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            if (data3.fieldPath !== void 0) {
              if (typeof data3.fieldPath !== "string") {
                const err13 = { instancePath: instancePath + "/inputRefs/" + i1 + "/fieldPath", schemaPath: "#/definitions/FieldRef/properties/fieldPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
          } else {
            const err14 = { instancePath: instancePath + "/inputRefs/" + i1, schemaPath: "#/definitions/FieldRef/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
      } else {
        const err15 = { instancePath: instancePath + "/inputRefs", schemaPath: "#/properties/inputRefs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.observedAt !== void 0) {
      let data6 = data.observedAt;
      if (typeof data6 !== "string" && data6 !== null) {
        const err16 = { instancePath: instancePath + "/observedAt", schemaPath: "#/properties/observedAt/type", keyword: "type", params: { type: schema18.properties.observedAt.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.origin !== void 0) {
      let data7 = data.origin;
      if (typeof data7 !== "string") {
        const err17 = { instancePath: instancePath + "/origin", schemaPath: "#/definitions/MeasurementOrigin/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      if (!(data7 === "synthetic" || data7 === "manufacturer" || data7 === "retailer" || data7 === "userMeasured" || data7 === "userDeclared" || data7 === "aiEstimated" || data7 === "derived")) {
        const err18 = { instancePath: instancePath + "/origin", schemaPath: "#/definitions/MeasurementOrigin/enum", keyword: "enum", params: { allowedValues: schema20.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.ruleIds !== void 0) {
      let data8 = data.ruleIds;
      if (Array.isArray(data8)) {
        const len2 = data8.length;
        for (let i2 = 0; i2 < len2; i2++) {
          if (typeof data8[i2] !== "string") {
            const err19 = { instancePath: instancePath + "/ruleIds/" + i2, schemaPath: "#/properties/ruleIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath: instancePath + "/ruleIds", schemaPath: "#/properties/ruleIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.verification !== void 0) {
      let data10 = data.verification;
      if (typeof data10 !== "string") {
        const err21 = { instancePath: instancePath + "/verification", schemaPath: "#/definitions/VerificationStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
      if (!(data10 === "unverified" || data10 === "estimated" || data10 === "confirmed")) {
        const err22 = { instancePath: instancePath + "/verification", schemaPath: "#/definitions/VerificationStatus/enum", keyword: "enum", params: { allowedValues: schema21.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
  } else {
    const err23 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err23];
    } else {
      vErrors.push(err23);
    }
    errors++;
  }
  validate16.errors = vErrors;
  return errors === 0;
}
function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.value === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.provenance === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "provenance" }, message: "must have required property 'provenance'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "provenance" || key0 === "state" || key0 === "value")) {
        const err3 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.provenance !== void 0) {
      if (!validate16(data.provenance, { instancePath: instancePath + "/provenance", parentData: data, parentDataProperty: "provenance", rootData })) {
        vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
        errors = vErrors.length;
      }
    }
    if (data.state !== void 0) {
      let data1 = data.state;
      if (typeof data1 !== "string") {
        const err4 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if ("known" !== data1) {
        const err5 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/const", keyword: "const", params: { allowedValue: "known" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.value !== void 0) {
      let data2 = data.value;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
        const err6 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/ClearanceMm/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 1e4 || isNaN(data2)) {
          const err7 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/ClearanceMm/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data2 < 0 || isNaN(data2)) {
          const err8 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/ClearanceMm/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    }
  } else {
    const err9 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs10 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err10 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.reason === void 0) {
      const err11 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "reason" || key1 === "state")) {
        const err12 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.reason !== void 0) {
      let data3 = data.reason;
      if (typeof data3 !== "string") {
        const err13 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      if (!(data3 === "notMeasured" || data3 === "notProvided" || data3 === "sourceMissing" || data3 === "conflictingSources")) {
        const err14 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/enum", keyword: "enum", params: { allowedValues: schema23.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data4 = data.state;
      if (typeof data4 !== "string") {
        const err15 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      if ("unknown" !== data4) {
        const err16 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs18 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.state === void 0) {
        const err18 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (data.reasonCode === void 0) {
        const err19 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "reasonCode" || key2 === "state")) {
          const err20 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.reasonCode !== void 0) {
        if (typeof data.reasonCode !== "string") {
          const err21 = { instancePath: instancePath + "/reasonCode", schemaPath: "#/oneOf/2/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.state !== void 0) {
        let data6 = data.state;
        if (typeof data6 !== "string") {
          const err22 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if ("notApplicable" !== data6) {
          const err23 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/const", keyword: "const", params: { allowedValue: "notApplicable" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    } else {
      const err24 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err24];
      } else {
        vErrors.push(err24);
      }
      errors++;
    }
    var _valid0 = _errs18 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err25 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err25];
    } else {
      vErrors.push(err25);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate15.errors = vErrors;
  return errors === 0;
}
function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "state")) {
        const err1 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data0 = data.state;
      if (typeof data0 !== "string") {
        const err2 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if ("unknown" !== data0) {
        const err3 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
  } else {
    const err4 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs6 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err5 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.minusText === void 0) {
      const err6 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "minusText" }, message: "must have required property 'minusText'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.plusText === void 0) {
      const err7 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "plusText" }, message: "must have required property 'plusText'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.unit === void 0) {
      const err8 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "unit" }, message: "must have required property 'unit'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "minusText" || key1 === "plusText" || key1 === "state" || key1 === "unit")) {
        const err9 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.minusText !== void 0) {
      if (typeof data.minusText !== "string") {
        const err10 = { instancePath: instancePath + "/minusText", schemaPath: "#/oneOf/1/properties/minusText/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.plusText !== void 0) {
      if (typeof data.plusText !== "string") {
        const err11 = { instancePath: instancePath + "/plusText", schemaPath: "#/oneOf/1/properties/plusText/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data3 = data.state;
      if (typeof data3 !== "string") {
        const err12 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if ("bounded" !== data3) {
        const err13 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/const", keyword: "const", params: { allowedValue: "bounded" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.unit !== void 0) {
      let data4 = data.unit;
      if (typeof data4 !== "string") {
        const err14 = { instancePath: instancePath + "/unit", schemaPath: "#/definitions/Unit/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      if (!(data4 === "mm" || data4 === "cm")) {
        const err15 = { instancePath: instancePath + "/unit", schemaPath: "#/definitions/Unit/enum", keyword: "enum", params: { allowedValues: schema27.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
  } else {
    const err16 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err16];
    } else {
      vErrors.push(err16);
    }
    errors++;
  }
  var _valid0 = _errs6 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
  }
  if (!valid0) {
    const err17 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate20.errors = vErrors;
  return errors === 0;
}
function validate19(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.text === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.unit === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unit" }, message: "must have required property 'unit'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.uncertainty === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "uncertainty" }, message: "must have required property 'uncertainty'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.origin === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "origin" }, message: "must have required property 'origin'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.evidenceIds === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "evidenceIds" }, message: "must have required property 'evidenceIds'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "evidenceIds" || key0 === "origin" || key0 === "text" || key0 === "uncertainty" || key0 === "unit")) {
        const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.evidenceIds !== void 0) {
      let data0 = data.evidenceIds;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (typeof data0[i0] !== "string") {
            const err6 = { instancePath: instancePath + "/evidenceIds/" + i0, schemaPath: "#/properties/evidenceIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      } else {
        const err7 = { instancePath: instancePath + "/evidenceIds", schemaPath: "#/properties/evidenceIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.origin !== void 0) {
      let data2 = data.origin;
      if (typeof data2 !== "string") {
        const err8 = { instancePath: instancePath + "/origin", schemaPath: "#/definitions/MeasurementOrigin/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
      if (!(data2 === "synthetic" || data2 === "manufacturer" || data2 === "retailer" || data2 === "userMeasured" || data2 === "userDeclared" || data2 === "aiEstimated" || data2 === "derived")) {
        const err9 = { instancePath: instancePath + "/origin", schemaPath: "#/definitions/MeasurementOrigin/enum", keyword: "enum", params: { allowedValues: schema20.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.text !== void 0) {
      if (typeof data.text !== "string") {
        const err10 = { instancePath: instancePath + "/text", schemaPath: "#/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.uncertainty !== void 0) {
      if (!validate20(data.uncertainty, { instancePath: instancePath + "/uncertainty", parentData: data, parentDataProperty: "uncertainty", rootData })) {
        vErrors = vErrors === null ? validate20.errors : vErrors.concat(validate20.errors);
        errors = vErrors.length;
      }
    }
    if (data.unit !== void 0) {
      let data5 = data.unit;
      if (typeof data5 !== "string") {
        const err11 = { instancePath: instancePath + "/unit", schemaPath: "#/definitions/Unit/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      if (!(data5 === "mm" || data5 === "cm")) {
        const err12 = { instancePath: instancePath + "/unit", schemaPath: "#/definitions/Unit/enum", keyword: "enum", params: { allowedValues: schema27.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
  } else {
    const err13 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err13];
    } else {
      vErrors.push(err13);
    }
    errors++;
  }
  validate19.errors = vErrors;
  return errors === 0;
}
function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.compartmentWidth === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "compartmentWidth" }, message: "must have required property 'compartmentWidth'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.unitWidth === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unitWidth" }, message: "must have required property 'unitWidth'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.unitCount === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unitCount" }, message: "must have required property 'unitCount'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.leftGapMm === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "leftGapMm" }, message: "must have required property 'leftGapMm'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.rightGapMm === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "rightGapMm" }, message: "must have required property 'rightGapMm'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.betweenGapMm === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "betweenGapMm" }, message: "must have required property 'betweenGapMm'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.neededNewUnits === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "neededNewUnits" }, message: "must have required property 'neededNewUnits'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.packQuantity === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "packQuantity" }, message: "must have required property 'packQuantity'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "betweenGapMm" || key0 === "compartmentWidth" || key0 === "leftGapMm" || key0 === "neededNewUnits" || key0 === "packQuantity" || key0 === "rightGapMm" || key0 === "unitCount" || key0 === "unitWidth")) {
        const err8 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.betweenGapMm !== void 0) {
      if (!validate15(data.betweenGapMm, { instancePath: instancePath + "/betweenGapMm", parentData: data, parentDataProperty: "betweenGapMm", rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
    }
    if (data.compartmentWidth !== void 0) {
      if (!validate19(data.compartmentWidth, { instancePath: instancePath + "/compartmentWidth", parentData: data, parentDataProperty: "compartmentWidth", rootData })) {
        vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
        errors = vErrors.length;
      }
    }
    if (data.leftGapMm !== void 0) {
      if (!validate15(data.leftGapMm, { instancePath: instancePath + "/leftGapMm", parentData: data, parentDataProperty: "leftGapMm", rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
    }
    if (data.neededNewUnits !== void 0) {
      let data3 = data.neededNewUnits;
      if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
        if (data3.text === void 0) {
          const err9 = { instancePath: instancePath + "/neededNewUnits", schemaPath: "#/definitions/RawCountDto/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key1 in data3) {
          if (!(key1 === "text")) {
            const err10 = { instancePath: instancePath + "/neededNewUnits", schemaPath: "#/definitions/RawCountDto/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data3.text !== void 0) {
          if (typeof data3.text !== "string") {
            const err11 = { instancePath: instancePath + "/neededNewUnits/text", schemaPath: "#/definitions/RawCountDto/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
      } else {
        const err12 = { instancePath: instancePath + "/neededNewUnits", schemaPath: "#/definitions/RawCountDto/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.packQuantity !== void 0) {
      let data5 = data.packQuantity;
      if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
        if (data5.text === void 0) {
          const err13 = { instancePath: instancePath + "/packQuantity", schemaPath: "#/definitions/RawCountDto/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        for (const key2 in data5) {
          if (!(key2 === "text")) {
            const err14 = { instancePath: instancePath + "/packQuantity", schemaPath: "#/definitions/RawCountDto/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data5.text !== void 0) {
          if (typeof data5.text !== "string") {
            const err15 = { instancePath: instancePath + "/packQuantity/text", schemaPath: "#/definitions/RawCountDto/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
      } else {
        const err16 = { instancePath: instancePath + "/packQuantity", schemaPath: "#/definitions/RawCountDto/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.rightGapMm !== void 0) {
      if (!validate15(data.rightGapMm, { instancePath: instancePath + "/rightGapMm", parentData: data, parentDataProperty: "rightGapMm", rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
    }
    if (data.unitCount !== void 0) {
      let data8 = data.unitCount;
      if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
        if (data8.text === void 0) {
          const err17 = { instancePath: instancePath + "/unitCount", schemaPath: "#/definitions/RawCountDto/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        for (const key3 in data8) {
          if (!(key3 === "text")) {
            const err18 = { instancePath: instancePath + "/unitCount", schemaPath: "#/definitions/RawCountDto/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data8.text !== void 0) {
          if (typeof data8.text !== "string") {
            const err19 = { instancePath: instancePath + "/unitCount/text", schemaPath: "#/definitions/RawCountDto/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath: instancePath + "/unitCount", schemaPath: "#/definitions/RawCountDto/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.unitWidth !== void 0) {
      if (!validate19(data.unitWidth, { instancePath: instancePath + "/unitWidth", parentData: data, parentDataProperty: "unitWidth", rootData })) {
        vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err21 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err21];
    } else {
      vErrors.push(err21);
    }
    errors++;
  }
  validate14.errors = vErrors;
  return errors === 0;
}
function validate65(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.probe === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "probe" }, message: "must have required property 'probe'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "kind" || key0 === "probe")) {
        const err2 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.kind !== void 0) {
      let data0 = data.kind;
      if (typeof data0 !== "string") {
        const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      if ("bootstrap" !== data0) {
        const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "bootstrap" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.probe !== void 0) {
      if (!validate14(data.probe, { instancePath: instancePath + "/probe", parentData: data, parentDataProperty: "probe", rootData })) {
        vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err5 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err5];
    } else {
      vErrors.push(err5);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  if (!valid0) {
    const err6 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate65.errors = vErrors;
  return errors === 0;
}
function validate62(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.buildId === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "buildId" }, message: "must have required property 'buildId'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.expectedProtocolVersion === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "expectedProtocolVersion" }, message: "must have required property 'expectedProtocolVersion'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.expectedSchemaVersion === void 0) {
      const err3 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "expectedSchemaVersion" }, message: "must have required property 'expectedSchemaVersion'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "buildId" || key0 === "expectedProtocolVersion" || key0 === "expectedSchemaVersion" || key0 === "kind")) {
        const err4 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.buildId !== void 0) {
      if (typeof data.buildId !== "string") {
        const err5 = { instancePath: instancePath + "/buildId", schemaPath: "#/oneOf/0/properties/buildId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.expectedProtocolVersion !== void 0) {
      let data1 = data.expectedProtocolVersion;
      if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
        const err6 = { instancePath: instancePath + "/expectedProtocolVersion", schemaPath: "#/oneOf/0/properties/expectedProtocolVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (typeof data1 == "number" && isFinite(data1)) {
        if (data1 > 4294967295 || isNaN(data1)) {
          const err7 = { instancePath: instancePath + "/expectedProtocolVersion", schemaPath: "#/oneOf/0/properties/expectedProtocolVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data1 < 0 || isNaN(data1)) {
          const err8 = { instancePath: instancePath + "/expectedProtocolVersion", schemaPath: "#/oneOf/0/properties/expectedProtocolVersion/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    }
    if (data.expectedSchemaVersion !== void 0) {
      let data2 = data.expectedSchemaVersion;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
        const err9 = { instancePath: instancePath + "/expectedSchemaVersion", schemaPath: "#/oneOf/0/properties/expectedSchemaVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 4294967295 || isNaN(data2)) {
          const err10 = { instancePath: instancePath + "/expectedSchemaVersion", schemaPath: "#/oneOf/0/properties/expectedSchemaVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data2 < 0 || isNaN(data2)) {
          const err11 = { instancePath: instancePath + "/expectedSchemaVersion", schemaPath: "#/oneOf/0/properties/expectedSchemaVersion/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
    }
    if (data.kind !== void 0) {
      let data3 = data.kind;
      if (typeof data3 !== "string") {
        const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if ("initialize" !== data3) {
        const err13 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "initialize" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
  } else {
    const err14 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err14];
    } else {
      vErrors.push(err14);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs12 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === void 0) {
      const err15 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err15];
      } else {
        vErrors.push(err15);
      }
      errors++;
    }
    if (data.context === void 0) {
      const err16 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "context" }, message: "must have required property 'context'" };
      if (vErrors === null) {
        vErrors = [err16];
      } else {
        vErrors.push(err16);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "context" || key1 === "kind")) {
        const err17 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.context !== void 0) {
      let data4 = data.context;
      const _errs17 = errors;
      let valid4 = false;
      let passing1 = null;
      const _errs18 = errors;
      if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
        if (data4.kind === void 0) {
          const err18 = { instancePath: instancePath + "/context", schemaPath: "#/definitions/BootstrapContext/oneOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        for (const key2 in data4) {
          if (!(key2 === "kind")) {
            const err19 = { instancePath: instancePath + "/context", schemaPath: "#/definitions/BootstrapContext/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data4.kind !== void 0) {
          let data5 = data4.kind;
          if (typeof data5 !== "string") {
            const err20 = { instancePath: instancePath + "/context/kind", schemaPath: "#/definitions/BootstrapContext/oneOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          if ("bootstrap" !== data5) {
            const err21 = { instancePath: instancePath + "/context/kind", schemaPath: "#/definitions/BootstrapContext/oneOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "bootstrap" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
      } else {
        const err22 = { instancePath: instancePath + "/context", schemaPath: "#/definitions/BootstrapContext/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      var _valid1 = _errs18 === errors;
      if (_valid1) {
        valid4 = true;
        passing1 = 0;
      }
      if (!valid4) {
        const err23 = { instancePath: instancePath + "/context", schemaPath: "#/definitions/BootstrapContext/oneOf", keyword: "oneOf", params: { passingSchemas: passing1 }, message: "must match exactly one schema in oneOf" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      } else {
        errors = _errs17;
        if (vErrors !== null) {
          if (_errs17) {
            vErrors.length = _errs17;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.kind !== void 0) {
      let data6 = data.kind;
      if (typeof data6 !== "string") {
        const err24 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      if ("activateProject" !== data6) {
        const err25 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "activateProject" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
  } else {
    const err26 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err26];
    } else {
      vErrors.push(err26);
    }
    errors++;
  }
  var _valid0 = _errs12 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs25 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.kind === void 0) {
        const err27 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      if (data.input === void 0) {
        const err28 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
      if (data.priorInputDigest === void 0) {
        const err29 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "priorInputDigest" }, message: "must have required property 'priorInputDigest'" };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
      if (data.formatRequests === void 0) {
        const err30 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "formatRequests" }, message: "must have required property 'formatRequests'" };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
      for (const key3 in data) {
        if (!(key3 === "formatRequests" || key3 === "input" || key3 === "kind" || key3 === "priorInputDigest")) {
          const err31 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err31];
          } else {
            vErrors.push(err31);
          }
          errors++;
        }
      }
      if (data.formatRequests !== void 0) {
        let data7 = data.formatRequests;
        if (Array.isArray(data7)) {
          const len0 = data7.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate63(data7[i0], { instancePath: instancePath + "/formatRequests/" + i0, parentData: data7, parentDataProperty: i0, rootData })) {
              vErrors = vErrors === null ? validate63.errors : vErrors.concat(validate63.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err32 = { instancePath: instancePath + "/formatRequests", schemaPath: "#/oneOf/2/properties/formatRequests/type", keyword: "type", params: { type: "array" }, message: "must be array" };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
      }
      if (data.input !== void 0) {
        if (!validate65(data.input, { instancePath: instancePath + "/input", parentData: data, parentDataProperty: "input", rootData })) {
          vErrors = vErrors === null ? validate65.errors : vErrors.concat(validate65.errors);
          errors = vErrors.length;
        }
      }
      if (data.kind !== void 0) {
        let data10 = data.kind;
        if (typeof data10 !== "string") {
          const err33 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
        if ("normalizeInput" !== data10) {
          const err34 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "normalizeInput" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
      if (data.priorInputDigest !== void 0) {
        let data11 = data.priorInputDigest;
        if (typeof data11 !== "string" && data11 !== null) {
          const err35 = { instancePath: instancePath + "/priorInputDigest", schemaPath: "#/oneOf/2/properties/priorInputDigest/type", keyword: "type", params: { type: schema64.oneOf[2].properties.priorInputDigest.type }, message: "must be string,null" };
          if (vErrors === null) {
            vErrors = [err35];
          } else {
            vErrors.push(err35);
          }
          errors++;
        }
      }
    } else {
      const err36 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err36];
      } else {
        vErrors.push(err36);
      }
      errors++;
    }
    var _valid0 = _errs25 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs36 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err37 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err37];
          } else {
            vErrors.push(err37);
          }
          errors++;
        }
        if (data.probe === void 0) {
          const err38 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: "probe" }, message: "must have required property 'probe'" };
          if (vErrors === null) {
            vErrors = [err38];
          } else {
            vErrors.push(err38);
          }
          errors++;
        }
        for (const key4 in data) {
          if (!(key4 === "kind" || key4 === "probe")) {
            const err39 = { instancePath, schemaPath: "#/oneOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data12 = data.kind;
          if (typeof data12 !== "string") {
            const err40 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err40];
            } else {
              vErrors.push(err40);
            }
            errors++;
          }
          if ("evaluateProbe" !== data12) {
            const err41 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "evaluateProbe" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err41];
            } else {
              vErrors.push(err41);
            }
            errors++;
          }
        }
        if (data.probe !== void 0) {
          if (!validate14(data.probe, { instancePath: instancePath + "/probe", parentData: data, parentDataProperty: "probe", rootData })) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err42 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err42];
        } else {
          vErrors.push(err42);
        }
        errors++;
      }
      var _valid0 = _errs36 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs42 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err43 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err43];
            } else {
              vErrors.push(err43);
            }
            errors++;
          }
          for (const key5 in data) {
            if (!(key5 === "kind")) {
              const err44 = { instancePath, schemaPath: "#/oneOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data14 = data.kind;
            if (typeof data14 !== "string") {
              const err45 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
            if ("disposeProject" !== data14) {
              const err46 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "disposeProject" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
          }
        } else {
          const err47 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err47];
          } else {
            vErrors.push(err47);
          }
          errors++;
        }
        var _valid0 = _errs42 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
        }
      }
    }
  }
  if (!valid0) {
    const err48 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err48];
    } else {
      vErrors.push(err48);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate62.errors = vErrors;
  return errors === 0;
}
var schema69 = { "additionalProperties": false, "properties": { "contextId": { "type": ["string", "null"] }, "editorEpoch": { "$ref": "#/definitions/Revision" }, "inputRevision": { "$ref": "#/definitions/Revision" }, "projectActivationId": { "type": "string" }, "projectId": { "type": "string" }, "protocolVersion": { "maximum": 4294967295, "minimum": 0, "type": "integer" }, "requestId": { "type": "string" }, "schemaVersion": { "maximum": 4294967295, "minimum": 0, "type": "integer" }, "workerSessionId": { "type": "string" } }, "required": ["protocolVersion", "schemaVersion", "workerSessionId", "projectActivationId", "requestId", "projectId", "editorEpoch", "inputRevision", "contextId"], "title": "RequestMeta", "type": "object" };
var func6 = Object.prototype.hasOwnProperty;
var func2 = require_ucs2length().default;
var pattern0 = new RegExp("^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|18446744073709550[0-9]{3}|18446744073709551[0-5][0-9]{2}|1844674407370955160[0-9]{1}|1844674407370955161[0-4][0-9]{0}|18446744073709551615)(?![\\s\\S])", "u");
function validate70(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.protocolVersion === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.schemaVersion === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schemaVersion" }, message: "must have required property 'schemaVersion'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.workerSessionId === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "workerSessionId" }, message: "must have required property 'workerSessionId'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.projectActivationId === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "projectActivationId" }, message: "must have required property 'projectActivationId'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.requestId === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.projectId === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "projectId" }, message: "must have required property 'projectId'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.editorEpoch === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "editorEpoch" }, message: "must have required property 'editorEpoch'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.inputRevision === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputRevision" }, message: "must have required property 'inputRevision'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.contextId === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "contextId" }, message: "must have required property 'contextId'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func6.call(schema69.properties, key0)) {
        const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.contextId !== void 0) {
      let data0 = data.contextId;
      if (typeof data0 !== "string" && data0 !== null) {
        const err10 = { instancePath: instancePath + "/contextId", schemaPath: "#/properties/contextId/type", keyword: "type", params: { type: schema69.properties.contextId.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.editorEpoch !== void 0) {
      let data1 = data.editorEpoch;
      if (typeof data1 === "string") {
        if (func2(data1) > 20) {
          const err11 = { instancePath: instancePath + "/editorEpoch", schemaPath: "#/definitions/Revision/maxLength", keyword: "maxLength", params: { limit: 20 }, message: "must NOT have more than 20 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (func2(data1) < 1) {
          const err12 = { instancePath: instancePath + "/editorEpoch", schemaPath: "#/definitions/Revision/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        if (!pattern0.test(data1)) {
          const err13 = { instancePath: instancePath + "/editorEpoch", schemaPath: "#/definitions/Revision/pattern", keyword: "pattern", params: { pattern: "^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|18446744073709550[0-9]{3}|18446744073709551[0-5][0-9]{2}|1844674407370955160[0-9]{1}|1844674407370955161[0-4][0-9]{0}|18446744073709551615)(?![\\s\\S])" }, message: 'must match pattern "^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|18446744073709550[0-9]{3}|18446744073709551[0-5][0-9]{2}|1844674407370955160[0-9]{1}|1844674407370955161[0-4][0-9]{0}|18446744073709551615)(?![\\s\\S])"' };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = { instancePath: instancePath + "/editorEpoch", schemaPath: "#/definitions/Revision/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.inputRevision !== void 0) {
      let data2 = data.inputRevision;
      if (typeof data2 === "string") {
        if (func2(data2) > 20) {
          const err15 = { instancePath: instancePath + "/inputRevision", schemaPath: "#/definitions/Revision/maxLength", keyword: "maxLength", params: { limit: 20 }, message: "must NOT have more than 20 characters" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        if (func2(data2) < 1) {
          const err16 = { instancePath: instancePath + "/inputRevision", schemaPath: "#/definitions/Revision/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (!pattern0.test(data2)) {
          const err17 = { instancePath: instancePath + "/inputRevision", schemaPath: "#/definitions/Revision/pattern", keyword: "pattern", params: { pattern: "^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|18446744073709550[0-9]{3}|18446744073709551[0-5][0-9]{2}|1844674407370955160[0-9]{1}|1844674407370955161[0-4][0-9]{0}|18446744073709551615)(?![\\s\\S])" }, message: 'must match pattern "^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|18446744073709550[0-9]{3}|18446744073709551[0-5][0-9]{2}|1844674407370955160[0-9]{1}|1844674407370955161[0-4][0-9]{0}|18446744073709551615)(?![\\s\\S])"' };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      } else {
        const err18 = { instancePath: instancePath + "/inputRevision", schemaPath: "#/definitions/Revision/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.projectActivationId !== void 0) {
      if (typeof data.projectActivationId !== "string") {
        const err19 = { instancePath: instancePath + "/projectActivationId", schemaPath: "#/properties/projectActivationId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.projectId !== void 0) {
      if (typeof data.projectId !== "string") {
        const err20 = { instancePath: instancePath + "/projectId", schemaPath: "#/properties/projectId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      let data5 = data.protocolVersion;
      if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
        const err21 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
      if (typeof data5 == "number" && isFinite(data5)) {
        if (data5 > 4294967295 || isNaN(data5)) {
          const err22 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if (data5 < 0 || isNaN(data5)) {
          const err23 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    }
    if (data.requestId !== void 0) {
      if (typeof data.requestId !== "string") {
        const err24 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.schemaVersion !== void 0) {
      let data7 = data.schemaVersion;
      if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
        const err25 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/properties/schemaVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      if (typeof data7 == "number" && isFinite(data7)) {
        if (data7 > 4294967295 || isNaN(data7)) {
          const err26 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/properties/schemaVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        if (data7 < 0 || isNaN(data7)) {
          const err27 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/properties/schemaVersion/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
    }
    if (data.workerSessionId !== void 0) {
      if (typeof data.workerSessionId !== "string") {
        const err28 = { instancePath: instancePath + "/workerSessionId", schemaPath: "#/properties/workerSessionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
  } else {
    const err29 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err29];
    } else {
      vErrors.push(err29);
    }
    errors++;
  }
  validate70.errors = vErrors;
  return errors === 0;
}
function validate93(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.meta === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "meta" }, message: "must have required property 'meta'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.command === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "command" }, message: "must have required property 'command'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "command" || key0 === "meta")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.command !== void 0) {
      if (!validate62(data.command, { instancePath: instancePath + "/command", parentData: data, parentDataProperty: "command", rootData })) {
        vErrors = vErrors === null ? validate62.errors : vErrors.concat(validate62.errors);
        errors = vErrors.length;
      }
    }
    if (data.meta !== void 0) {
      if (!validate70(data.meta, { instancePath: instancePath + "/meta", parentData: data, parentDataProperty: "meta", rootData })) {
        vErrors = vErrors === null ? validate70.errors : vErrors.concat(validate70.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err3 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  validate93.errors = vErrors;
  return errors === 0;
}
var validateProtocolResponse = validate96;
var schema73 = { "oneOf": [{ "additionalProperties": false, "properties": { "buildId": { "type": "string" }, "canonicalVersion": { "maximum": 4294967295, "minimum": 0, "type": "integer" }, "capabilities": { "items": { "type": "string" }, "type": "array" }, "kind": { "const": "ready", "type": "string" }, "protocolVersion": { "maximum": 4294967295, "minimum": 0, "type": "integer" }, "ruleVersion": { "type": "string" }, "schemaVersion": { "maximum": 4294967295, "minimum": 0, "type": "integer" }, "solverVersion": { "type": "string" } }, "required": ["kind", "buildId", "protocolVersion", "schemaVersion", "canonicalVersion", "ruleVersion", "solverVersion", "capabilities"], "type": "object" }, { "additionalProperties": false, "properties": { "contextId": { "type": ["string", "null"] }, "kind": { "const": "projectActivated", "type": "string" } }, "required": ["kind", "contextId"], "type": "object" }, { "additionalProperties": false, "properties": { "diagnostics": { "items": { "$ref": "#/definitions/Diagnostic" }, "type": "array" }, "equivalentToPrior": { "type": "boolean" }, "formattedFields": { "items": { "$ref": "#/definitions/FormattedField" }, "type": "array" }, "inputDigest": { "type": ["string", "null"] }, "kind": { "const": "normalized", "type": "string" }, "normalizedInput": { "anyOf": [{ "$ref": "#/definitions/NormalizedBootstrapInput" }, { "type": "null" }] } }, "required": ["kind", "normalizedInput", "inputDigest", "equivalentToPrior", "formattedFields", "diagnostics"], "type": "object" }, { "additionalProperties": false, "properties": { "kind": { "const": "probeEvaluated", "type": "string" }, "result": { "$ref": "#/definitions/BootstrapProbeResult" } }, "required": ["kind", "result"], "type": "object" }, { "additionalProperties": false, "properties": { "kind": { "const": "projectDisposed", "type": "string" } }, "required": ["kind"], "type": "object" }, { "additionalProperties": false, "properties": { "affectedFields": { "items": { "type": "string" }, "type": "array" }, "affectedIds": { "items": { "type": "string" }, "type": "array" }, "code": { "type": "string" }, "kind": { "const": "operationFailed", "type": "string" }, "reasonParameters": { "additionalProperties": { "type": "string" }, "type": "object" }, "retryable": { "type": "boolean" } }, "required": ["kind", "code", "affectedFields", "affectedIds", "retryable", "reasonParameters"], "type": "object" }], "title": "Event" };
function validate75(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.fieldPath === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "fieldPath" }, message: "must have required property 'fieldPath'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.unit === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unit" }, message: "must have required property 'unit'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.text === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "fieldPath" || key0 === "text" || key0 === "unit")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.fieldPath !== void 0) {
      if (typeof data.fieldPath !== "string") {
        const err4 = { instancePath: instancePath + "/fieldPath", schemaPath: "#/properties/fieldPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.text !== void 0) {
      if (typeof data.text !== "string") {
        const err5 = { instancePath: instancePath + "/text", schemaPath: "#/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.unit !== void 0) {
      let data2 = data.unit;
      if (typeof data2 !== "string") {
        const err6 = { instancePath: instancePath + "/unit", schemaPath: "#/definitions/Unit/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (!(data2 === "mm" || data2 === "cm")) {
        const err7 = { instancePath: instancePath + "/unit", schemaPath: "#/definitions/Unit/enum", keyword: "enum", params: { allowedValues: schema27.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
  } else {
    const err8 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  validate75.errors = vErrors;
  return errors === 0;
}
function validate33(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "state")) {
        const err1 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data0 = data.state;
      if (typeof data0 !== "string") {
        const err2 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if ("unknown" !== data0) {
        const err3 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
  } else {
    const err4 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs6 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err5 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.minusMm === void 0) {
      const err6 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "minusMm" }, message: "must have required property 'minusMm'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.plusMm === void 0) {
      const err7 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "plusMm" }, message: "must have required property 'plusMm'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "minusMm" || key1 === "plusMm" || key1 === "state")) {
        const err8 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.minusMm !== void 0) {
      let data1 = data.minusMm;
      if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
        const err9 = { instancePath: instancePath + "/minusMm", schemaPath: "#/definitions/ClearanceMm/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      if (typeof data1 == "number" && isFinite(data1)) {
        if (data1 > 1e4 || isNaN(data1)) {
          const err10 = { instancePath: instancePath + "/minusMm", schemaPath: "#/definitions/ClearanceMm/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data1 < 0 || isNaN(data1)) {
          const err11 = { instancePath: instancePath + "/minusMm", schemaPath: "#/definitions/ClearanceMm/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
    }
    if (data.plusMm !== void 0) {
      let data2 = data.plusMm;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
        const err12 = { instancePath: instancePath + "/plusMm", schemaPath: "#/definitions/ClearanceMm/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 1e4 || isNaN(data2)) {
          const err13 = { instancePath: instancePath + "/plusMm", schemaPath: "#/definitions/ClearanceMm/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (data2 < 0 || isNaN(data2)) {
          const err14 = { instancePath: instancePath + "/plusMm", schemaPath: "#/definitions/ClearanceMm/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
    }
    if (data.state !== void 0) {
      let data3 = data.state;
      if (typeof data3 !== "string") {
        const err15 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      if ("bounded" !== data3) {
        const err16 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/const", keyword: "const", params: { allowedValue: "bounded" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  var _valid0 = _errs6 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
  }
  if (!valid0) {
    const err18 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err18];
    } else {
      vErrors.push(err18);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate33.errors = vErrors;
  return errors === 0;
}
function validate32(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.nominal === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nominal" }, message: "must have required property 'nominal'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.uncertainty === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "uncertainty" }, message: "must have required property 'uncertainty'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "nominal" || key0 === "uncertainty")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.nominal !== void 0) {
      let data0 = data.nominal;
      if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
        const err3 = { instancePath: instancePath + "/nominal", schemaPath: "#/definitions/LengthMm/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      if (typeof data0 == "number" && isFinite(data0)) {
        if (data0 > 1e4 || isNaN(data0)) {
          const err4 = { instancePath: instancePath + "/nominal", schemaPath: "#/definitions/LengthMm/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data0 < 1 || isNaN(data0)) {
          const err5 = { instancePath: instancePath + "/nominal", schemaPath: "#/definitions/LengthMm/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
    }
    if (data.uncertainty !== void 0) {
      if (!validate33(data.uncertainty, { instancePath: instancePath + "/uncertainty", parentData: data, parentDataProperty: "uncertainty", rootData })) {
        vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err6 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
  }
  validate32.errors = vErrors;
  return errors === 0;
}
function validate30(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.value === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.provenance === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "provenance" }, message: "must have required property 'provenance'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "provenance" || key0 === "state" || key0 === "value")) {
        const err3 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.provenance !== void 0) {
      if (!validate16(data.provenance, { instancePath: instancePath + "/provenance", parentData: data, parentDataProperty: "provenance", rootData })) {
        vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
        errors = vErrors.length;
      }
    }
    if (data.state !== void 0) {
      let data1 = data.state;
      if (typeof data1 !== "string") {
        const err4 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if ("known" !== data1) {
        const err5 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/const", keyword: "const", params: { allowedValue: "known" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.value !== void 0) {
      if (!validate32(data.value, { instancePath: instancePath + "/value", parentData: data, parentDataProperty: "value", rootData })) {
        vErrors = vErrors === null ? validate32.errors : vErrors.concat(validate32.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err6 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs8 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err7 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.reason === void 0) {
      const err8 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "reason" || key1 === "state")) {
        const err9 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.reason !== void 0) {
      let data3 = data.reason;
      if (typeof data3 !== "string") {
        const err10 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      if (!(data3 === "notMeasured" || data3 === "notProvided" || data3 === "sourceMissing" || data3 === "conflictingSources")) {
        const err11 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/enum", keyword: "enum", params: { allowedValues: schema23.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data4 = data.state;
      if (typeof data4 !== "string") {
        const err12 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if ("unknown" !== data4) {
        const err13 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
  } else {
    const err14 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err14];
    } else {
      vErrors.push(err14);
    }
    errors++;
  }
  var _valid0 = _errs8 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs16 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.state === void 0) {
        const err15 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      if (data.reasonCode === void 0) {
        const err16 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "reasonCode" || key2 === "state")) {
          const err17 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      }
      if (data.reasonCode !== void 0) {
        if (typeof data.reasonCode !== "string") {
          const err18 = { instancePath: instancePath + "/reasonCode", schemaPath: "#/oneOf/2/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      }
      if (data.state !== void 0) {
        let data6 = data.state;
        if (typeof data6 !== "string") {
          const err19 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        if ("notApplicable" !== data6) {
          const err20 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/const", keyword: "const", params: { allowedValue: "notApplicable" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
    } else {
      const err21 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err21];
      } else {
        vErrors.push(err21);
      }
      errors++;
    }
    var _valid0 = _errs16 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err22 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate30.errors = vErrors;
  return errors === 0;
}
function validate39(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.value === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.provenance === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "provenance" }, message: "must have required property 'provenance'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "provenance" || key0 === "state" || key0 === "value")) {
        const err3 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.provenance !== void 0) {
      if (!validate16(data.provenance, { instancePath: instancePath + "/provenance", parentData: data, parentDataProperty: "provenance", rootData })) {
        vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
        errors = vErrors.length;
      }
    }
    if (data.state !== void 0) {
      let data1 = data.state;
      if (typeof data1 !== "string") {
        const err4 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if ("known" !== data1) {
        const err5 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/const", keyword: "const", params: { allowedValue: "known" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.value !== void 0) {
      let data2 = data.value;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
        const err6 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/Quantity/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 1e4 || isNaN(data2)) {
          const err7 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/Quantity/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data2 < 0 || isNaN(data2)) {
          const err8 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/Quantity/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    }
  } else {
    const err9 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs10 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err10 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.reason === void 0) {
      const err11 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "reason" || key1 === "state")) {
        const err12 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.reason !== void 0) {
      let data3 = data.reason;
      if (typeof data3 !== "string") {
        const err13 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      if (!(data3 === "notMeasured" || data3 === "notProvided" || data3 === "sourceMissing" || data3 === "conflictingSources")) {
        const err14 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/enum", keyword: "enum", params: { allowedValues: schema23.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data4 = data.state;
      if (typeof data4 !== "string") {
        const err15 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      if ("unknown" !== data4) {
        const err16 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs18 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.state === void 0) {
        const err18 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (data.reasonCode === void 0) {
        const err19 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "reasonCode" || key2 === "state")) {
          const err20 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.reasonCode !== void 0) {
        if (typeof data.reasonCode !== "string") {
          const err21 = { instancePath: instancePath + "/reasonCode", schemaPath: "#/oneOf/2/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.state !== void 0) {
        let data6 = data.state;
        if (typeof data6 !== "string") {
          const err22 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if ("notApplicable" !== data6) {
          const err23 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/const", keyword: "const", params: { allowedValue: "notApplicable" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    } else {
      const err24 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err24];
      } else {
        vErrors.push(err24);
      }
      errors++;
    }
    var _valid0 = _errs18 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err25 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err25];
    } else {
      vErrors.push(err25);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate39.errors = vErrors;
  return errors === 0;
}
function validate82(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.value === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.provenance === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "provenance" }, message: "must have required property 'provenance'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "provenance" || key0 === "state" || key0 === "value")) {
        const err3 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.provenance !== void 0) {
      if (!validate16(data.provenance, { instancePath: instancePath + "/provenance", parentData: data, parentDataProperty: "provenance", rootData })) {
        vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
        errors = vErrors.length;
      }
    }
    if (data.state !== void 0) {
      let data1 = data.state;
      if (typeof data1 !== "string") {
        const err4 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if ("known" !== data1) {
        const err5 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/const", keyword: "const", params: { allowedValue: "known" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.value !== void 0) {
      let data2 = data.value;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
        const err6 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/PackQuantity/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 1e4 || isNaN(data2)) {
          const err7 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/PackQuantity/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data2 < 1 || isNaN(data2)) {
          const err8 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/PackQuantity/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    }
  } else {
    const err9 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs10 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err10 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.reason === void 0) {
      const err11 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "reason" || key1 === "state")) {
        const err12 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.reason !== void 0) {
      let data3 = data.reason;
      if (typeof data3 !== "string") {
        const err13 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      if (!(data3 === "notMeasured" || data3 === "notProvided" || data3 === "sourceMissing" || data3 === "conflictingSources")) {
        const err14 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/enum", keyword: "enum", params: { allowedValues: schema23.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data4 = data.state;
      if (typeof data4 !== "string") {
        const err15 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      if ("unknown" !== data4) {
        const err16 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs18 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.state === void 0) {
        const err18 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (data.reasonCode === void 0) {
        const err19 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "reasonCode" || key2 === "state")) {
          const err20 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.reasonCode !== void 0) {
        if (typeof data.reasonCode !== "string") {
          const err21 = { instancePath: instancePath + "/reasonCode", schemaPath: "#/oneOf/2/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.state !== void 0) {
        let data6 = data.state;
        if (typeof data6 !== "string") {
          const err22 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if ("notApplicable" !== data6) {
          const err23 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/const", keyword: "const", params: { allowedValue: "notApplicable" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    } else {
      const err24 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err24];
      } else {
        vErrors.push(err24);
      }
      errors++;
    }
    var _valid0 = _errs18 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err25 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err25];
    } else {
      vErrors.push(err25);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate82.errors = vErrors;
  return errors === 0;
}
function validate77(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.compartmentWidth === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "compartmentWidth" }, message: "must have required property 'compartmentWidth'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.unitWidth === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unitWidth" }, message: "must have required property 'unitWidth'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.unitCount === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unitCount" }, message: "must have required property 'unitCount'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.leftGapMm === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "leftGapMm" }, message: "must have required property 'leftGapMm'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.rightGapMm === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "rightGapMm" }, message: "must have required property 'rightGapMm'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.betweenGapMm === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "betweenGapMm" }, message: "must have required property 'betweenGapMm'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.neededNewUnits === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "neededNewUnits" }, message: "must have required property 'neededNewUnits'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.packQuantity === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "packQuantity" }, message: "must have required property 'packQuantity'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "betweenGapMm" || key0 === "compartmentWidth" || key0 === "leftGapMm" || key0 === "neededNewUnits" || key0 === "packQuantity" || key0 === "rightGapMm" || key0 === "unitCount" || key0 === "unitWidth")) {
        const err8 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.betweenGapMm !== void 0) {
      if (!validate15(data.betweenGapMm, { instancePath: instancePath + "/betweenGapMm", parentData: data, parentDataProperty: "betweenGapMm", rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
    }
    if (data.compartmentWidth !== void 0) {
      if (!validate30(data.compartmentWidth, { instancePath: instancePath + "/compartmentWidth", parentData: data, parentDataProperty: "compartmentWidth", rootData })) {
        vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
        errors = vErrors.length;
      }
    }
    if (data.leftGapMm !== void 0) {
      if (!validate15(data.leftGapMm, { instancePath: instancePath + "/leftGapMm", parentData: data, parentDataProperty: "leftGapMm", rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
    }
    if (data.neededNewUnits !== void 0) {
      if (!validate39(data.neededNewUnits, { instancePath: instancePath + "/neededNewUnits", parentData: data, parentDataProperty: "neededNewUnits", rootData })) {
        vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
        errors = vErrors.length;
      }
    }
    if (data.packQuantity !== void 0) {
      if (!validate82(data.packQuantity, { instancePath: instancePath + "/packQuantity", parentData: data, parentDataProperty: "packQuantity", rootData })) {
        vErrors = vErrors === null ? validate82.errors : vErrors.concat(validate82.errors);
        errors = vErrors.length;
      }
    }
    if (data.rightGapMm !== void 0) {
      if (!validate15(data.rightGapMm, { instancePath: instancePath + "/rightGapMm", parentData: data, parentDataProperty: "rightGapMm", rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
    }
    if (data.unitCount !== void 0) {
      if (!validate39(data.unitCount, { instancePath: instancePath + "/unitCount", parentData: data, parentDataProperty: "unitCount", rootData })) {
        vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
        errors = vErrors.length;
      }
    }
    if (data.unitWidth !== void 0) {
      if (!validate30(data.unitWidth, { instancePath: instancePath + "/unitWidth", parentData: data, parentDataProperty: "unitWidth", rootData })) {
        vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err9 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  validate77.errors = vErrors;
  return errors === 0;
}
function validate42(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.value === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.provenance === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "provenance" }, message: "must have required property 'provenance'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "provenance" || key0 === "state" || key0 === "value")) {
        const err3 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.provenance !== void 0) {
      if (!validate16(data.provenance, { instancePath: instancePath + "/provenance", parentData: data, parentDataProperty: "provenance", rootData })) {
        vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
        errors = vErrors.length;
      }
    }
    if (data.state !== void 0) {
      let data1 = data.state;
      if (typeof data1 !== "string") {
        const err4 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if ("known" !== data1) {
        const err5 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/const", keyword: "const", params: { allowedValue: "known" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.value !== void 0) {
      let data2 = data.value;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
        const err6 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/UnitCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 4294967295 || isNaN(data2)) {
          const err7 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/UnitCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data2 < 0 || isNaN(data2)) {
          const err8 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/UnitCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    }
  } else {
    const err9 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs10 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err10 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.reason === void 0) {
      const err11 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "reason" || key1 === "state")) {
        const err12 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.reason !== void 0) {
      let data3 = data.reason;
      if (typeof data3 !== "string") {
        const err13 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      if (!(data3 === "notMeasured" || data3 === "notProvided" || data3 === "sourceMissing" || data3 === "conflictingSources")) {
        const err14 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/enum", keyword: "enum", params: { allowedValues: schema23.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data4 = data.state;
      if (typeof data4 !== "string") {
        const err15 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      if ("unknown" !== data4) {
        const err16 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs18 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.state === void 0) {
        const err18 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (data.reasonCode === void 0) {
        const err19 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "reasonCode" || key2 === "state")) {
          const err20 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.reasonCode !== void 0) {
        if (typeof data.reasonCode !== "string") {
          const err21 = { instancePath: instancePath + "/reasonCode", schemaPath: "#/oneOf/2/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.state !== void 0) {
        let data6 = data.state;
        if (typeof data6 !== "string") {
          const err22 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if ("notApplicable" !== data6) {
          const err23 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/const", keyword: "const", params: { allowedValue: "notApplicable" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    } else {
      const err24 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err24];
      } else {
        vErrors.push(err24);
      }
      errors++;
    }
    var _valid0 = _errs18 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err25 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err25];
    } else {
      vErrors.push(err25);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate42.errors = vErrors;
  return errors === 0;
}
function validate38(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.packsToOrder === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "packsToOrder" }, message: "must have required property 'packsToOrder'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.suppliedUnits === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "suppliedUnits" }, message: "must have required property 'suppliedUnits'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.surplusUnits === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "surplusUnits" }, message: "must have required property 'surplusUnits'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "packsToOrder" || key0 === "suppliedUnits" || key0 === "surplusUnits")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.packsToOrder !== void 0) {
      if (!validate39(data.packsToOrder, { instancePath: instancePath + "/packsToOrder", parentData: data, parentDataProperty: "packsToOrder", rootData })) {
        vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
        errors = vErrors.length;
      }
    }
    if (data.suppliedUnits !== void 0) {
      if (!validate42(data.suppliedUnits, { instancePath: instancePath + "/suppliedUnits", parentData: data, parentDataProperty: "suppliedUnits", rootData })) {
        vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
        errors = vErrors.length;
      }
    }
    if (data.surplusUnits !== void 0) {
      if (!validate42(data.surplusUnits, { instancePath: instancePath + "/surplusUnits", parentData: data, parentDataProperty: "surplusUnits", rootData })) {
        vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err4 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
  }
  validate38.errors = vErrors;
  return errors === 0;
}
function validate47(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.value === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.provenance === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "provenance" }, message: "must have required property 'provenance'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "provenance" || key0 === "state" || key0 === "value")) {
        const err3 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.provenance !== void 0) {
      if (!validate16(data.provenance, { instancePath: instancePath + "/provenance", parentData: data, parentDataProperty: "provenance", rootData })) {
        vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
        errors = vErrors.length;
      }
    }
    if (data.state !== void 0) {
      let data1 = data.state;
      if (typeof data1 !== "string") {
        const err4 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if ("known" !== data1) {
        const err5 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/const", keyword: "const", params: { allowedValue: "known" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.value !== void 0) {
      let data2 = data.value;
      if (typeof data2 === "string") {
        if (func2(data2) > 20) {
          const err6 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/Revision/maxLength", keyword: "maxLength", params: { limit: 20 }, message: "must NOT have more than 20 characters" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (func2(data2) < 1) {
          const err7 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/Revision/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (!pattern0.test(data2)) {
          const err8 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/Revision/pattern", keyword: "pattern", params: { pattern: "^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|18446744073709550[0-9]{3}|18446744073709551[0-5][0-9]{2}|1844674407370955160[0-9]{1}|1844674407370955161[0-4][0-9]{0}|18446744073709551615)(?![\\s\\S])" }, message: 'must match pattern "^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|18446744073709550[0-9]{3}|18446744073709551[0-5][0-9]{2}|1844674407370955160[0-9]{1}|1844674407370955161[0-4][0-9]{0}|18446744073709551615)(?![\\s\\S])"' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = { instancePath: instancePath + "/value", schemaPath: "#/definitions/Revision/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
  } else {
    const err10 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err10];
    } else {
      vErrors.push(err10);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs10 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err11 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    if (data.reason === void 0) {
      const err12 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "reason" || key1 === "state")) {
        const err13 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.reason !== void 0) {
      let data3 = data.reason;
      if (typeof data3 !== "string") {
        const err14 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      if (!(data3 === "notMeasured" || data3 === "notProvided" || data3 === "sourceMissing" || data3 === "conflictingSources")) {
        const err15 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/enum", keyword: "enum", params: { allowedValues: schema23.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data4 = data.state;
      if (typeof data4 !== "string") {
        const err16 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      if ("unknown" !== data4) {
        const err17 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
  } else {
    const err18 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err18];
    } else {
      vErrors.push(err18);
    }
    errors++;
  }
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs18 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.state === void 0) {
        const err19 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      if (data.reasonCode === void 0) {
        const err20 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "reasonCode" || key2 === "state")) {
          const err21 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.reasonCode !== void 0) {
        if (typeof data.reasonCode !== "string") {
          const err22 = { instancePath: instancePath + "/reasonCode", schemaPath: "#/oneOf/2/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      }
      if (data.state !== void 0) {
        let data6 = data.state;
        if (typeof data6 !== "string") {
          const err23 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        if ("notApplicable" !== data6) {
          const err24 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/const", keyword: "const", params: { allowedValue: "notApplicable" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
    } else {
      const err25 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err25];
      } else {
        vErrors.push(err25);
      }
      errors++;
    }
    var _valid0 = _errs18 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err26 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err26];
    } else {
      vErrors.push(err26);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate47.errors = vErrors;
  return errors === 0;
}
function validate52(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.ordinal === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "ordinal" }, message: "must have required property 'ordinal'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.xMm === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "xMm" }, message: "must have required property 'xMm'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.widthMm === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "widthMm" }, message: "must have required property 'widthMm'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "ordinal" || key0 === "widthMm" || key0 === "xMm")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.ordinal !== void 0) {
      let data0 = data.ordinal;
      if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
        const err4 = { instancePath: instancePath + "/ordinal", schemaPath: "#/properties/ordinal/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if (typeof data0 == "number" && isFinite(data0)) {
        if (data0 > 4294967295 || isNaN(data0)) {
          const err5 = { instancePath: instancePath + "/ordinal", schemaPath: "#/properties/ordinal/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data0 < 0 || isNaN(data0)) {
          const err6 = { instancePath: instancePath + "/ordinal", schemaPath: "#/properties/ordinal/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    }
    if (data.widthMm !== void 0) {
      let data1 = data.widthMm;
      if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
        const err7 = { instancePath: instancePath + "/widthMm", schemaPath: "#/definitions/LengthMm/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      if (typeof data1 == "number" && isFinite(data1)) {
        if (data1 > 1e4 || isNaN(data1)) {
          const err8 = { instancePath: instancePath + "/widthMm", schemaPath: "#/definitions/LengthMm/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e4 }, message: "must be <= 10000" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data1 < 1 || isNaN(data1)) {
          const err9 = { instancePath: instancePath + "/widthMm", schemaPath: "#/definitions/LengthMm/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
    }
    if (data.xMm !== void 0) {
      let data2 = data.xMm;
      if (typeof data2 === "string") {
        if (func2(data2) > 20) {
          const err10 = { instancePath: instancePath + "/xMm", schemaPath: "#/definitions/Revision/maxLength", keyword: "maxLength", params: { limit: 20 }, message: "must NOT have more than 20 characters" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (func2(data2) < 1) {
          const err11 = { instancePath: instancePath + "/xMm", schemaPath: "#/definitions/Revision/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (!pattern0.test(data2)) {
          const err12 = { instancePath: instancePath + "/xMm", schemaPath: "#/definitions/Revision/pattern", keyword: "pattern", params: { pattern: "^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|18446744073709550[0-9]{3}|18446744073709551[0-5][0-9]{2}|1844674407370955160[0-9]{1}|1844674407370955161[0-4][0-9]{0}|18446744073709551615)(?![\\s\\S])" }, message: 'must match pattern "^(?:0|[1-9][0-9]{0,18}|1[0-7][0-9]{18}|18[0-3][0-9]{17}|184[0-3][0-9]{16}|1844[0-5][0-9]{15}|18446[0-6][0-9]{14}|184467[0-3][0-9]{13}|1844674[0-3][0-9]{12}|184467440[0-6][0-9]{10}|1844674407[0-2][0-9]{9}|18446744073[0-6][0-9]{8}|1844674407370[0-8][0-9]{6}|18446744073709[0-4][0-9]{5}|184467440737095[0-4][0-9]{4}|18446744073709550[0-9]{3}|18446744073709551[0-5][0-9]{2}|1844674407370955160[0-9]{1}|1844674407370955161[0-4][0-9]{0}|18446744073709551615)(?![\\s\\S])"' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = { instancePath: instancePath + "/xMm", schemaPath: "#/definitions/Revision/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
  } else {
    const err14 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err14];
    } else {
      vErrors.push(err14);
    }
    errors++;
  }
  validate52.errors = vErrors;
  return errors === 0;
}
function validate50(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.value === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.provenance === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "provenance" }, message: "must have required property 'provenance'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "provenance" || key0 === "state" || key0 === "value")) {
        const err3 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.provenance !== void 0) {
      if (!validate16(data.provenance, { instancePath: instancePath + "/provenance", parentData: data, parentDataProperty: "provenance", rootData })) {
        vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
        errors = vErrors.length;
      }
    }
    if (data.state !== void 0) {
      let data1 = data.state;
      if (typeof data1 !== "string") {
        const err4 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if ("known" !== data1) {
        const err5 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/0/properties/state/const", keyword: "const", params: { allowedValue: "known" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.value !== void 0) {
      let data2 = data.value;
      if (Array.isArray(data2)) {
        const len0 = data2.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (!validate52(data2[i0], { instancePath: instancePath + "/value/" + i0, parentData: data2, parentDataProperty: i0, rootData })) {
            vErrors = vErrors === null ? validate52.errors : vErrors.concat(validate52.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err6 = { instancePath: instancePath + "/value", schemaPath: "#/oneOf/0/properties/value/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs10 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.state === void 0) {
      const err8 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.reason === void 0) {
      const err9 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "reason" || key1 === "state")) {
        const err10 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.reason !== void 0) {
      let data4 = data.reason;
      if (typeof data4 !== "string") {
        const err11 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      if (!(data4 === "notMeasured" || data4 === "notProvided" || data4 === "sourceMissing" || data4 === "conflictingSources")) {
        const err12 = { instancePath: instancePath + "/reason", schemaPath: "#/definitions/UnknownReason/enum", keyword: "enum", params: { allowedValues: schema23.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data5 = data.state;
      if (typeof data5 !== "string") {
        const err13 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      if ("unknown" !== data5) {
        const err14 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/1/properties/state/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
  } else {
    const err15 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
    }
    errors++;
  }
  var _valid0 = _errs10 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs18 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.state === void 0) {
        const err16 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      if (data.reasonCode === void 0) {
        const err17 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "reasonCode" || key2 === "state")) {
          const err18 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      }
      if (data.reasonCode !== void 0) {
        if (typeof data.reasonCode !== "string") {
          const err19 = { instancePath: instancePath + "/reasonCode", schemaPath: "#/oneOf/2/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
      if (data.state !== void 0) {
        let data7 = data.state;
        if (typeof data7 !== "string") {
          const err20 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        if ("notApplicable" !== data7) {
          const err21 = { instancePath: instancePath + "/state", schemaPath: "#/oneOf/2/properties/state/const", keyword: "const", params: { allowedValue: "notApplicable" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
    } else {
      const err22 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err22];
      } else {
        vErrors.push(err22);
      }
      errors++;
    }
    var _valid0 = _errs18 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err23 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err23];
    } else {
      vErrors.push(err23);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate50.errors = vErrors;
  return errors === 0;
}
var schema56 = { "additionalProperties": false, "properties": { "basis": { "$ref": "#/definitions/CheckBasis" }, "blocking": { "type": "boolean" }, "evidenceRefs": { "items": { "$ref": "#/definitions/FieldRef" }, "type": "array" }, "id": { "type": "string" }, "kind": { "$ref": "#/definitions/CheckKind" }, "measurements": { "items": { "$ref": "#/definitions/CheckMeasurement" }, "type": "array" }, "reasonCode": { "type": "string" }, "remediation": { "items": { "$ref": "#/definitions/Remediation" }, "type": "array" }, "status": { "$ref": "#/definitions/CheckStatus" }, "subjectIds": { "items": { "type": "string" }, "type": "array" } }, "required": ["id", "kind", "subjectIds", "status", "reasonCode", "basis", "evidenceRefs", "measurements", "blocking", "remediation"], "title": "ConstraintCheck", "type": "object" };
var schema57 = { "enum": ["nominal"], "title": "CheckBasis", "type": "string" };
var schema59 = { "enum": ["outer_geometry"], "title": "CheckKind", "type": "string" };
var schema15 = { "enum": ["pass", "fail", "unknown", "not_applicable"], "title": "CheckStatus", "type": "string" };
function validate56(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.fieldPath === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "fieldPath" }, message: "must have required property 'fieldPath'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.valueMm === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "valueMm" }, message: "must have required property 'valueMm'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "fieldPath" || key0 === "valueMm")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.fieldPath !== void 0) {
      if (typeof data.fieldPath !== "string") {
        const err3 = { instancePath: instancePath + "/fieldPath", schemaPath: "#/properties/fieldPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.valueMm !== void 0) {
      if (!validate47(data.valueMm, { instancePath: instancePath + "/valueMm", parentData: data, parentDataProperty: "valueMm", rootData })) {
        vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err4 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
  }
  validate56.errors = vErrors;
  return errors === 0;
}
function validate55(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.subjectIds === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "subjectIds" }, message: "must have required property 'subjectIds'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.status === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.reasonCode === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.basis === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "basis" }, message: "must have required property 'basis'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.evidenceRefs === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "evidenceRefs" }, message: "must have required property 'evidenceRefs'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.measurements === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "measurements" }, message: "must have required property 'measurements'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.blocking === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "blocking" }, message: "must have required property 'blocking'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.remediation === void 0) {
      const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "remediation" }, message: "must have required property 'remediation'" };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func6.call(schema56.properties, key0)) {
        const err10 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.basis !== void 0) {
      let data0 = data.basis;
      if (typeof data0 !== "string") {
        const err11 = { instancePath: instancePath + "/basis", schemaPath: "#/definitions/CheckBasis/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      if (!(data0 === "nominal")) {
        const err12 = { instancePath: instancePath + "/basis", schemaPath: "#/definitions/CheckBasis/enum", keyword: "enum", params: { allowedValues: schema57.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.blocking !== void 0) {
      if (typeof data.blocking !== "boolean") {
        const err13 = { instancePath: instancePath + "/blocking", schemaPath: "#/properties/blocking/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.evidenceRefs !== void 0) {
      let data2 = data.evidenceRefs;
      if (Array.isArray(data2)) {
        const len0 = data2.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data3 = data2[i0];
          if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
            if (data3.entityId === void 0) {
              const err14 = { instancePath: instancePath + "/evidenceRefs/" + i0, schemaPath: "#/definitions/FieldRef/required", keyword: "required", params: { missingProperty: "entityId" }, message: "must have required property 'entityId'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data3.fieldPath === void 0) {
              const err15 = { instancePath: instancePath + "/evidenceRefs/" + i0, schemaPath: "#/definitions/FieldRef/required", keyword: "required", params: { missingProperty: "fieldPath" }, message: "must have required property 'fieldPath'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            for (const key1 in data3) {
              if (!(key1 === "entityId" || key1 === "fieldPath")) {
                const err16 = { instancePath: instancePath + "/evidenceRefs/" + i0, schemaPath: "#/definitions/FieldRef/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data3.entityId !== void 0) {
              if (typeof data3.entityId !== "string") {
                const err17 = { instancePath: instancePath + "/evidenceRefs/" + i0 + "/entityId", schemaPath: "#/definitions/FieldRef/properties/entityId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data3.fieldPath !== void 0) {
              if (typeof data3.fieldPath !== "string") {
                const err18 = { instancePath: instancePath + "/evidenceRefs/" + i0 + "/fieldPath", schemaPath: "#/definitions/FieldRef/properties/fieldPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/evidenceRefs/" + i0, schemaPath: "#/definitions/FieldRef/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath: instancePath + "/evidenceRefs", schemaPath: "#/properties/evidenceRefs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      if (typeof data.id !== "string") {
        const err21 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.kind !== void 0) {
      let data7 = data.kind;
      if (typeof data7 !== "string") {
        const err22 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/CheckKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      if (!(data7 === "outer_geometry")) {
        const err23 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/CheckKind/enum", keyword: "enum", params: { allowedValues: schema59.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.measurements !== void 0) {
      let data8 = data.measurements;
      if (Array.isArray(data8)) {
        const len1 = data8.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (!validate56(data8[i1], { instancePath: instancePath + "/measurements/" + i1, parentData: data8, parentDataProperty: i1, rootData })) {
            vErrors = vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err24 = { instancePath: instancePath + "/measurements", schemaPath: "#/properties/measurements/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.reasonCode !== void 0) {
      if (typeof data.reasonCode !== "string") {
        const err25 = { instancePath: instancePath + "/reasonCode", schemaPath: "#/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.remediation !== void 0) {
      let data11 = data.remediation;
      if (Array.isArray(data11)) {
        const len2 = data11.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data12 = data11[i2];
          if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
            if (data12.code === void 0) {
              const err26 = { instancePath: instancePath + "/remediation/" + i2, schemaPath: "#/definitions/Remediation/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data12.fieldPaths === void 0) {
              const err27 = { instancePath: instancePath + "/remediation/" + i2, schemaPath: "#/definitions/Remediation/required", keyword: "required", params: { missingProperty: "fieldPaths" }, message: "must have required property 'fieldPaths'" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            for (const key2 in data12) {
              if (!(key2 === "code" || key2 === "fieldPaths")) {
                const err28 = { instancePath: instancePath + "/remediation/" + i2, schemaPath: "#/definitions/Remediation/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
            }
            if (data12.code !== void 0) {
              if (typeof data12.code !== "string") {
                const err29 = { instancePath: instancePath + "/remediation/" + i2 + "/code", schemaPath: "#/definitions/Remediation/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data12.fieldPaths !== void 0) {
              let data14 = data12.fieldPaths;
              if (Array.isArray(data14)) {
                const len3 = data14.length;
                for (let i3 = 0; i3 < len3; i3++) {
                  if (typeof data14[i3] !== "string") {
                    const err30 = { instancePath: instancePath + "/remediation/" + i2 + "/fieldPaths/" + i3, schemaPath: "#/definitions/Remediation/properties/fieldPaths/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err30];
                    } else {
                      vErrors.push(err30);
                    }
                    errors++;
                  }
                }
              } else {
                const err31 = { instancePath: instancePath + "/remediation/" + i2 + "/fieldPaths", schemaPath: "#/definitions/Remediation/properties/fieldPaths/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
          } else {
            const err32 = { instancePath: instancePath + "/remediation/" + i2, schemaPath: "#/definitions/Remediation/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
      } else {
        const err33 = { instancePath: instancePath + "/remediation", schemaPath: "#/properties/remediation/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
    }
    if (data.status !== void 0) {
      let data16 = data.status;
      if (typeof data16 !== "string") {
        const err34 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/CheckStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
      if (!(data16 === "pass" || data16 === "fail" || data16 === "unknown" || data16 === "not_applicable")) {
        const err35 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/CheckStatus/enum", keyword: "enum", params: { allowedValues: schema15.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    if (data.subjectIds !== void 0) {
      let data17 = data.subjectIds;
      if (Array.isArray(data17)) {
        const len4 = data17.length;
        for (let i4 = 0; i4 < len4; i4++) {
          if (typeof data17[i4] !== "string") {
            const err36 = { instancePath: instancePath + "/subjectIds/" + i4, schemaPath: "#/properties/subjectIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
      } else {
        const err37 = { instancePath: instancePath + "/subjectIds", schemaPath: "#/properties/subjectIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
        }
        errors++;
      }
    }
  } else {
    const err38 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err38];
    } else {
      vErrors.push(err38);
    }
    errors++;
  }
  validate55.errors = vErrors;
  return errors === 0;
}
function validate29(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.normalizedCompartmentWidth === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "normalizedCompartmentWidth" }, message: "must have required property 'normalizedCompartmentWidth'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.normalizedUnitWidth === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "normalizedUnitWidth" }, message: "must have required property 'normalizedUnitWidth'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.requiredWidthMm === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requiredWidthMm" }, message: "must have required property 'requiredWidthMm'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.rowObjects === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "rowObjects" }, message: "must have required property 'rowObjects'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.widthCheck === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "widthCheck" }, message: "must have required property 'widthCheck'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.order === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.diagnostics === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "diagnostics" }, message: "must have required property 'diagnostics'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "diagnostics" || key0 === "normalizedCompartmentWidth" || key0 === "normalizedUnitWidth" || key0 === "order" || key0 === "requiredWidthMm" || key0 === "rowObjects" || key0 === "widthCheck")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.diagnostics !== void 0) {
      let data0 = data.diagnostics;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.fieldPath === void 0) {
              const err8 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/required", keyword: "required", params: { missingProperty: "fieldPath" }, message: "must have required property 'fieldPath'" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data1.code === void 0) {
              const err9 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (data1.reasonCode === void 0) {
              const err10 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "code" || key1 === "fieldPath" || key1 === "reasonCode")) {
                const err11 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
            if (data1.code !== void 0) {
              if (typeof data1.code !== "string") {
                const err12 = { instancePath: instancePath + "/diagnostics/" + i0 + "/code", schemaPath: "#/definitions/Diagnostic/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            if (data1.fieldPath !== void 0) {
              if (typeof data1.fieldPath !== "string") {
                const err13 = { instancePath: instancePath + "/diagnostics/" + i0 + "/fieldPath", schemaPath: "#/definitions/Diagnostic/properties/fieldPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data1.reasonCode !== void 0) {
              if (typeof data1.reasonCode !== "string") {
                const err14 = { instancePath: instancePath + "/diagnostics/" + i0 + "/reasonCode", schemaPath: "#/definitions/Diagnostic/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
          } else {
            const err15 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
      } else {
        const err16 = { instancePath: instancePath + "/diagnostics", schemaPath: "#/properties/diagnostics/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.normalizedCompartmentWidth !== void 0) {
      if (!validate30(data.normalizedCompartmentWidth, { instancePath: instancePath + "/normalizedCompartmentWidth", parentData: data, parentDataProperty: "normalizedCompartmentWidth", rootData })) {
        vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
        errors = vErrors.length;
      }
    }
    if (data.normalizedUnitWidth !== void 0) {
      if (!validate30(data.normalizedUnitWidth, { instancePath: instancePath + "/normalizedUnitWidth", parentData: data, parentDataProperty: "normalizedUnitWidth", rootData })) {
        vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
        errors = vErrors.length;
      }
    }
    if (data.order !== void 0) {
      if (!validate38(data.order, { instancePath: instancePath + "/order", parentData: data, parentDataProperty: "order", rootData })) {
        vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
        errors = vErrors.length;
      }
    }
    if (data.requiredWidthMm !== void 0) {
      if (!validate47(data.requiredWidthMm, { instancePath: instancePath + "/requiredWidthMm", parentData: data, parentDataProperty: "requiredWidthMm", rootData })) {
        vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
        errors = vErrors.length;
      }
    }
    if (data.rowObjects !== void 0) {
      if (!validate50(data.rowObjects, { instancePath: instancePath + "/rowObjects", parentData: data, parentDataProperty: "rowObjects", rootData })) {
        vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
        errors = vErrors.length;
      }
    }
    if (data.widthCheck !== void 0) {
      if (!validate55(data.widthCheck, { instancePath: instancePath + "/widthCheck", parentData: data, parentDataProperty: "widthCheck", rootData })) {
        vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err17 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  validate29.errors = vErrors;
  return errors === 0;
}
function validate74(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.buildId === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "buildId" }, message: "must have required property 'buildId'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.protocolVersion === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.schemaVersion === void 0) {
      const err3 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "schemaVersion" }, message: "must have required property 'schemaVersion'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.canonicalVersion === void 0) {
      const err4 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "canonicalVersion" }, message: "must have required property 'canonicalVersion'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.ruleVersion === void 0) {
      const err5 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "ruleVersion" }, message: "must have required property 'ruleVersion'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.solverVersion === void 0) {
      const err6 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "solverVersion" }, message: "must have required property 'solverVersion'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.capabilities === void 0) {
      const err7 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "capabilities" }, message: "must have required property 'capabilities'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "buildId" || key0 === "canonicalVersion" || key0 === "capabilities" || key0 === "kind" || key0 === "protocolVersion" || key0 === "ruleVersion" || key0 === "schemaVersion" || key0 === "solverVersion")) {
        const err8 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.buildId !== void 0) {
      if (typeof data.buildId !== "string") {
        const err9 = { instancePath: instancePath + "/buildId", schemaPath: "#/oneOf/0/properties/buildId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.canonicalVersion !== void 0) {
      let data1 = data.canonicalVersion;
      if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
        const err10 = { instancePath: instancePath + "/canonicalVersion", schemaPath: "#/oneOf/0/properties/canonicalVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      if (typeof data1 == "number" && isFinite(data1)) {
        if (data1 > 4294967295 || isNaN(data1)) {
          const err11 = { instancePath: instancePath + "/canonicalVersion", schemaPath: "#/oneOf/0/properties/canonicalVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (data1 < 0 || isNaN(data1)) {
          const err12 = { instancePath: instancePath + "/canonicalVersion", schemaPath: "#/oneOf/0/properties/canonicalVersion/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
    }
    if (data.capabilities !== void 0) {
      let data2 = data.capabilities;
      if (Array.isArray(data2)) {
        const len0 = data2.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (typeof data2[i0] !== "string") {
            const err13 = { instancePath: instancePath + "/capabilities/" + i0, schemaPath: "#/oneOf/0/properties/capabilities/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
      } else {
        const err14 = { instancePath: instancePath + "/capabilities", schemaPath: "#/oneOf/0/properties/capabilities/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.kind !== void 0) {
      let data4 = data.kind;
      if (typeof data4 !== "string") {
        const err15 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      if ("ready" !== data4) {
        const err16 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "ready" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      let data5 = data.protocolVersion;
      if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
        const err17 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/0/properties/protocolVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      if (typeof data5 == "number" && isFinite(data5)) {
        if (data5 > 4294967295 || isNaN(data5)) {
          const err18 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/0/properties/protocolVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (data5 < 0 || isNaN(data5)) {
          const err19 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/0/properties/protocolVersion/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
    }
    if (data.ruleVersion !== void 0) {
      if (typeof data.ruleVersion !== "string") {
        const err20 = { instancePath: instancePath + "/ruleVersion", schemaPath: "#/oneOf/0/properties/ruleVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.schemaVersion !== void 0) {
      let data7 = data.schemaVersion;
      if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
        const err21 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/oneOf/0/properties/schemaVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
      if (typeof data7 == "number" && isFinite(data7)) {
        if (data7 > 4294967295 || isNaN(data7)) {
          const err22 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/oneOf/0/properties/schemaVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if (data7 < 0 || isNaN(data7)) {
          const err23 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/oneOf/0/properties/schemaVersion/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    }
    if (data.solverVersion !== void 0) {
      if (typeof data.solverVersion !== "string") {
        const err24 = { instancePath: instancePath + "/solverVersion", schemaPath: "#/oneOf/0/properties/solverVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
  } else {
    const err25 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err25];
    } else {
      vErrors.push(err25);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs22 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.kind === void 0) {
      const err26 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err26];
      } else {
        vErrors.push(err26);
      }
      errors++;
    }
    if (data.contextId === void 0) {
      const err27 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "contextId" }, message: "must have required property 'contextId'" };
      if (vErrors === null) {
        vErrors = [err27];
      } else {
        vErrors.push(err27);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "contextId" || key1 === "kind")) {
        const err28 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.contextId !== void 0) {
      let data9 = data.contextId;
      if (typeof data9 !== "string" && data9 !== null) {
        const err29 = { instancePath: instancePath + "/contextId", schemaPath: "#/oneOf/1/properties/contextId/type", keyword: "type", params: { type: schema73.oneOf[1].properties.contextId.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.kind !== void 0) {
      let data10 = data.kind;
      if (typeof data10 !== "string") {
        const err30 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
      if ("projectActivated" !== data10) {
        const err31 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "projectActivated" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
  } else {
    const err32 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err32];
    } else {
      vErrors.push(err32);
    }
    errors++;
  }
  var _valid0 = _errs22 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs29 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.kind === void 0) {
        const err33 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
      if (data.normalizedInput === void 0) {
        const err34 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "normalizedInput" }, message: "must have required property 'normalizedInput'" };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
      if (data.inputDigest === void 0) {
        const err35 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "inputDigest" }, message: "must have required property 'inputDigest'" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
      if (data.equivalentToPrior === void 0) {
        const err36 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "equivalentToPrior" }, message: "must have required property 'equivalentToPrior'" };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      if (data.formattedFields === void 0) {
        const err37 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "formattedFields" }, message: "must have required property 'formattedFields'" };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
        }
        errors++;
      }
      if (data.diagnostics === void 0) {
        const err38 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "diagnostics" }, message: "must have required property 'diagnostics'" };
        if (vErrors === null) {
          vErrors = [err38];
        } else {
          vErrors.push(err38);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "diagnostics" || key2 === "equivalentToPrior" || key2 === "formattedFields" || key2 === "inputDigest" || key2 === "kind" || key2 === "normalizedInput")) {
          const err39 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err39];
          } else {
            vErrors.push(err39);
          }
          errors++;
        }
      }
      if (data.diagnostics !== void 0) {
        let data11 = data.diagnostics;
        if (Array.isArray(data11)) {
          const len1 = data11.length;
          for (let i1 = 0; i1 < len1; i1++) {
            let data12 = data11[i1];
            if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
              if (data12.fieldPath === void 0) {
                const err40 = { instancePath: instancePath + "/diagnostics/" + i1, schemaPath: "#/definitions/Diagnostic/required", keyword: "required", params: { missingProperty: "fieldPath" }, message: "must have required property 'fieldPath'" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
              if (data12.code === void 0) {
                const err41 = { instancePath: instancePath + "/diagnostics/" + i1, schemaPath: "#/definitions/Diagnostic/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
              if (data12.reasonCode === void 0) {
                const err42 = { instancePath: instancePath + "/diagnostics/" + i1, schemaPath: "#/definitions/Diagnostic/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
              for (const key3 in data12) {
                if (!(key3 === "code" || key3 === "fieldPath" || key3 === "reasonCode")) {
                  const err43 = { instancePath: instancePath + "/diagnostics/" + i1, schemaPath: "#/definitions/Diagnostic/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
              }
              if (data12.code !== void 0) {
                if (typeof data12.code !== "string") {
                  const err44 = { instancePath: instancePath + "/diagnostics/" + i1 + "/code", schemaPath: "#/definitions/Diagnostic/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
              }
              if (data12.fieldPath !== void 0) {
                if (typeof data12.fieldPath !== "string") {
                  const err45 = { instancePath: instancePath + "/diagnostics/" + i1 + "/fieldPath", schemaPath: "#/definitions/Diagnostic/properties/fieldPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err45];
                  } else {
                    vErrors.push(err45);
                  }
                  errors++;
                }
              }
              if (data12.reasonCode !== void 0) {
                if (typeof data12.reasonCode !== "string") {
                  const err46 = { instancePath: instancePath + "/diagnostics/" + i1 + "/reasonCode", schemaPath: "#/definitions/Diagnostic/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err46];
                  } else {
                    vErrors.push(err46);
                  }
                  errors++;
                }
              }
            } else {
              const err47 = { instancePath: instancePath + "/diagnostics/" + i1, schemaPath: "#/definitions/Diagnostic/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
          }
        } else {
          const err48 = { instancePath: instancePath + "/diagnostics", schemaPath: "#/oneOf/2/properties/diagnostics/type", keyword: "type", params: { type: "array" }, message: "must be array" };
          if (vErrors === null) {
            vErrors = [err48];
          } else {
            vErrors.push(err48);
          }
          errors++;
        }
      }
      if (data.equivalentToPrior !== void 0) {
        if (typeof data.equivalentToPrior !== "boolean") {
          const err49 = { instancePath: instancePath + "/equivalentToPrior", schemaPath: "#/oneOf/2/properties/equivalentToPrior/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
      }
      if (data.formattedFields !== void 0) {
        let data17 = data.formattedFields;
        if (Array.isArray(data17)) {
          const len2 = data17.length;
          for (let i2 = 0; i2 < len2; i2++) {
            if (!validate75(data17[i2], { instancePath: instancePath + "/formattedFields/" + i2, parentData: data17, parentDataProperty: i2, rootData })) {
              vErrors = vErrors === null ? validate75.errors : vErrors.concat(validate75.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err50 = { instancePath: instancePath + "/formattedFields", schemaPath: "#/oneOf/2/properties/formattedFields/type", keyword: "type", params: { type: "array" }, message: "must be array" };
          if (vErrors === null) {
            vErrors = [err50];
          } else {
            vErrors.push(err50);
          }
          errors++;
        }
      }
      if (data.inputDigest !== void 0) {
        let data19 = data.inputDigest;
        if (typeof data19 !== "string" && data19 !== null) {
          const err51 = { instancePath: instancePath + "/inputDigest", schemaPath: "#/oneOf/2/properties/inputDigest/type", keyword: "type", params: { type: schema73.oneOf[2].properties.inputDigest.type }, message: "must be string,null" };
          if (vErrors === null) {
            vErrors = [err51];
          } else {
            vErrors.push(err51);
          }
          errors++;
        }
      }
      if (data.kind !== void 0) {
        let data20 = data.kind;
        if (typeof data20 !== "string") {
          const err52 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
        if ("normalized" !== data20) {
          const err53 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "normalized" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err53];
          } else {
            vErrors.push(err53);
          }
          errors++;
        }
      }
      if (data.normalizedInput !== void 0) {
        let data21 = data.normalizedInput;
        const _errs54 = errors;
        let valid12 = false;
        const _errs55 = errors;
        if (!validate77(data21, { instancePath: instancePath + "/normalizedInput", parentData: data, parentDataProperty: "normalizedInput", rootData })) {
          vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
          errors = vErrors.length;
        }
        var _valid1 = _errs55 === errors;
        valid12 = valid12 || _valid1;
        if (!valid12) {
          const _errs56 = errors;
          if (data21 !== null) {
            const err54 = { instancePath: instancePath + "/normalizedInput", schemaPath: "#/oneOf/2/properties/normalizedInput/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
            if (vErrors === null) {
              vErrors = [err54];
            } else {
              vErrors.push(err54);
            }
            errors++;
          }
          var _valid1 = _errs56 === errors;
          valid12 = valid12 || _valid1;
        }
        if (!valid12) {
          const err55 = { instancePath: instancePath + "/normalizedInput", schemaPath: "#/oneOf/2/properties/normalizedInput/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
          if (vErrors === null) {
            vErrors = [err55];
          } else {
            vErrors.push(err55);
          }
          errors++;
        } else {
          errors = _errs54;
          if (vErrors !== null) {
            if (_errs54) {
              vErrors.length = _errs54;
            } else {
              vErrors = null;
            }
          }
        }
      }
    } else {
      const err56 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err56];
      } else {
        vErrors.push(err56);
      }
      errors++;
    }
    var _valid0 = _errs29 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs58 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err57 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err57];
          } else {
            vErrors.push(err57);
          }
          errors++;
        }
        if (data.result === void 0) {
          const err58 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
          if (vErrors === null) {
            vErrors = [err58];
          } else {
            vErrors.push(err58);
          }
          errors++;
        }
        for (const key4 in data) {
          if (!(key4 === "kind" || key4 === "result")) {
            const err59 = { instancePath, schemaPath: "#/oneOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err59];
            } else {
              vErrors.push(err59);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data22 = data.kind;
          if (typeof data22 !== "string") {
            const err60 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err60];
            } else {
              vErrors.push(err60);
            }
            errors++;
          }
          if ("probeEvaluated" !== data22) {
            const err61 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "probeEvaluated" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err61];
            } else {
              vErrors.push(err61);
            }
            errors++;
          }
        }
        if (data.result !== void 0) {
          if (!validate29(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
            vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err62 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
      var _valid0 = _errs58 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs64 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err63 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err63];
            } else {
              vErrors.push(err63);
            }
            errors++;
          }
          for (const key5 in data) {
            if (!(key5 === "kind")) {
              const err64 = { instancePath, schemaPath: "#/oneOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err64];
              } else {
                vErrors.push(err64);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data24 = data.kind;
            if (typeof data24 !== "string") {
              const err65 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err65];
              } else {
                vErrors.push(err65);
              }
              errors++;
            }
            if ("projectDisposed" !== data24) {
              const err66 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "projectDisposed" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err66];
              } else {
                vErrors.push(err66);
              }
              errors++;
            }
          }
        } else {
          const err67 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err67];
          } else {
            vErrors.push(err67);
          }
          errors++;
        }
        var _valid0 = _errs64 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
          const _errs69 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err68 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err68];
              } else {
                vErrors.push(err68);
              }
              errors++;
            }
            if (data.code === void 0) {
              const err69 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
              if (vErrors === null) {
                vErrors = [err69];
              } else {
                vErrors.push(err69);
              }
              errors++;
            }
            if (data.affectedFields === void 0) {
              const err70 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: "affectedFields" }, message: "must have required property 'affectedFields'" };
              if (vErrors === null) {
                vErrors = [err70];
              } else {
                vErrors.push(err70);
              }
              errors++;
            }
            if (data.affectedIds === void 0) {
              const err71 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: "affectedIds" }, message: "must have required property 'affectedIds'" };
              if (vErrors === null) {
                vErrors = [err71];
              } else {
                vErrors.push(err71);
              }
              errors++;
            }
            if (data.retryable === void 0) {
              const err72 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: "retryable" }, message: "must have required property 'retryable'" };
              if (vErrors === null) {
                vErrors = [err72];
              } else {
                vErrors.push(err72);
              }
              errors++;
            }
            if (data.reasonParameters === void 0) {
              const err73 = { instancePath, schemaPath: "#/oneOf/5/required", keyword: "required", params: { missingProperty: "reasonParameters" }, message: "must have required property 'reasonParameters'" };
              if (vErrors === null) {
                vErrors = [err73];
              } else {
                vErrors.push(err73);
              }
              errors++;
            }
            for (const key6 in data) {
              if (!(key6 === "affectedFields" || key6 === "affectedIds" || key6 === "code" || key6 === "kind" || key6 === "reasonParameters" || key6 === "retryable")) {
                const err74 = { instancePath, schemaPath: "#/oneOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err74];
                } else {
                  vErrors.push(err74);
                }
                errors++;
              }
            }
            if (data.affectedFields !== void 0) {
              let data25 = data.affectedFields;
              if (Array.isArray(data25)) {
                const len3 = data25.length;
                for (let i3 = 0; i3 < len3; i3++) {
                  if (typeof data25[i3] !== "string") {
                    const err75 = { instancePath: instancePath + "/affectedFields/" + i3, schemaPath: "#/oneOf/5/properties/affectedFields/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err75];
                    } else {
                      vErrors.push(err75);
                    }
                    errors++;
                  }
                }
              } else {
                const err76 = { instancePath: instancePath + "/affectedFields", schemaPath: "#/oneOf/5/properties/affectedFields/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err76];
                } else {
                  vErrors.push(err76);
                }
                errors++;
              }
            }
            if (data.affectedIds !== void 0) {
              let data27 = data.affectedIds;
              if (Array.isArray(data27)) {
                const len4 = data27.length;
                for (let i4 = 0; i4 < len4; i4++) {
                  if (typeof data27[i4] !== "string") {
                    const err77 = { instancePath: instancePath + "/affectedIds/" + i4, schemaPath: "#/oneOf/5/properties/affectedIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err77];
                    } else {
                      vErrors.push(err77);
                    }
                    errors++;
                  }
                }
              } else {
                const err78 = { instancePath: instancePath + "/affectedIds", schemaPath: "#/oneOf/5/properties/affectedIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err78];
                } else {
                  vErrors.push(err78);
                }
                errors++;
              }
            }
            if (data.code !== void 0) {
              if (typeof data.code !== "string") {
                const err79 = { instancePath: instancePath + "/code", schemaPath: "#/oneOf/5/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err79];
                } else {
                  vErrors.push(err79);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data30 = data.kind;
              if (typeof data30 !== "string") {
                const err80 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err80];
                } else {
                  vErrors.push(err80);
                }
                errors++;
              }
              if ("operationFailed" !== data30) {
                const err81 = { instancePath: instancePath + "/kind", schemaPath: "#/oneOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "operationFailed" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err81];
                } else {
                  vErrors.push(err81);
                }
                errors++;
              }
            }
            if (data.reasonParameters !== void 0) {
              let data31 = data.reasonParameters;
              if (data31 && typeof data31 == "object" && !Array.isArray(data31)) {
                for (const key7 in data31) {
                  if (typeof data31[key7] !== "string") {
                    const err82 = { instancePath: instancePath + "/reasonParameters/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"), schemaPath: "#/oneOf/5/properties/reasonParameters/additionalProperties/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err82];
                    } else {
                      vErrors.push(err82);
                    }
                    errors++;
                  }
                }
              } else {
                const err83 = { instancePath: instancePath + "/reasonParameters", schemaPath: "#/oneOf/5/properties/reasonParameters/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err83];
                } else {
                  vErrors.push(err83);
                }
                errors++;
              }
            }
            if (data.retryable !== void 0) {
              if (typeof data.retryable !== "boolean") {
                const err84 = { instancePath: instancePath + "/retryable", schemaPath: "#/oneOf/5/properties/retryable/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err84];
                } else {
                  vErrors.push(err84);
                }
                errors++;
              }
            }
          } else {
            const err85 = { instancePath, schemaPath: "#/oneOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err85];
            } else {
              vErrors.push(err85);
            }
            errors++;
          }
          var _valid0 = _errs69 === errors;
          if (_valid0 && valid0) {
            valid0 = false;
            passing0 = [passing0, 5];
          } else {
            if (_valid0) {
              valid0 = true;
              passing0 = 5;
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    const err86 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err86];
    } else {
      vErrors.push(err86);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate74.errors = vErrors;
  return errors === 0;
}
function validate96(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.meta === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "meta" }, message: "must have required property 'meta'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.sequence === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.event === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "event" }, message: "must have required property 'event'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "event" || key0 === "meta" || key0 === "sequence")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.event !== void 0) {
      if (!validate74(data.event, { instancePath: instancePath + "/event", parentData: data, parentDataProperty: "event", rootData })) {
        vErrors = vErrors === null ? validate74.errors : vErrors.concat(validate74.errors);
        errors = vErrors.length;
      }
    }
    if (data.meta !== void 0) {
      if (!validate70(data.meta, { instancePath: instancePath + "/meta", parentData: data, parentDataProperty: "meta", rootData })) {
        vErrors = vErrors === null ? validate70.errors : vErrors.concat(validate70.errors);
        errors = vErrors.length;
      }
    }
    if (data.sequence !== void 0) {
      let data2 = data.sequence;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
        const err4 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 4294967295 || isNaN(data2)) {
          const err5 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data2 < 0 || isNaN(data2)) {
          const err6 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    }
  } else {
    const err7 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate96.errors = vErrors;
  return errors === 0;
}
var validateBootstrapProbeDto = validate99;
function validate99(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.compartmentWidth === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "compartmentWidth" }, message: "must have required property 'compartmentWidth'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.unitWidth === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unitWidth" }, message: "must have required property 'unitWidth'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.unitCount === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unitCount" }, message: "must have required property 'unitCount'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.leftGapMm === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "leftGapMm" }, message: "must have required property 'leftGapMm'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.rightGapMm === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "rightGapMm" }, message: "must have required property 'rightGapMm'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.betweenGapMm === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "betweenGapMm" }, message: "must have required property 'betweenGapMm'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.neededNewUnits === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "neededNewUnits" }, message: "must have required property 'neededNewUnits'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.packQuantity === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "packQuantity" }, message: "must have required property 'packQuantity'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "betweenGapMm" || key0 === "compartmentWidth" || key0 === "leftGapMm" || key0 === "neededNewUnits" || key0 === "packQuantity" || key0 === "rightGapMm" || key0 === "unitCount" || key0 === "unitWidth")) {
        const err8 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.betweenGapMm !== void 0) {
      if (!validate15(data.betweenGapMm, { instancePath: instancePath + "/betweenGapMm", parentData: data, parentDataProperty: "betweenGapMm", rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
    }
    if (data.compartmentWidth !== void 0) {
      if (!validate19(data.compartmentWidth, { instancePath: instancePath + "/compartmentWidth", parentData: data, parentDataProperty: "compartmentWidth", rootData })) {
        vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
        errors = vErrors.length;
      }
    }
    if (data.leftGapMm !== void 0) {
      if (!validate15(data.leftGapMm, { instancePath: instancePath + "/leftGapMm", parentData: data, parentDataProperty: "leftGapMm", rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
    }
    if (data.neededNewUnits !== void 0) {
      let data3 = data.neededNewUnits;
      if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
        if (data3.text === void 0) {
          const err9 = { instancePath: instancePath + "/neededNewUnits", schemaPath: "#/definitions/RawCountDto/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key1 in data3) {
          if (!(key1 === "text")) {
            const err10 = { instancePath: instancePath + "/neededNewUnits", schemaPath: "#/definitions/RawCountDto/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data3.text !== void 0) {
          if (typeof data3.text !== "string") {
            const err11 = { instancePath: instancePath + "/neededNewUnits/text", schemaPath: "#/definitions/RawCountDto/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
      } else {
        const err12 = { instancePath: instancePath + "/neededNewUnits", schemaPath: "#/definitions/RawCountDto/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.packQuantity !== void 0) {
      let data5 = data.packQuantity;
      if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
        if (data5.text === void 0) {
          const err13 = { instancePath: instancePath + "/packQuantity", schemaPath: "#/definitions/RawCountDto/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        for (const key2 in data5) {
          if (!(key2 === "text")) {
            const err14 = { instancePath: instancePath + "/packQuantity", schemaPath: "#/definitions/RawCountDto/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data5.text !== void 0) {
          if (typeof data5.text !== "string") {
            const err15 = { instancePath: instancePath + "/packQuantity/text", schemaPath: "#/definitions/RawCountDto/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
      } else {
        const err16 = { instancePath: instancePath + "/packQuantity", schemaPath: "#/definitions/RawCountDto/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.rightGapMm !== void 0) {
      if (!validate15(data.rightGapMm, { instancePath: instancePath + "/rightGapMm", parentData: data, parentDataProperty: "rightGapMm", rootData })) {
        vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
        errors = vErrors.length;
      }
    }
    if (data.unitCount !== void 0) {
      let data8 = data.unitCount;
      if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
        if (data8.text === void 0) {
          const err17 = { instancePath: instancePath + "/unitCount", schemaPath: "#/definitions/RawCountDto/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        for (const key3 in data8) {
          if (!(key3 === "text")) {
            const err18 = { instancePath: instancePath + "/unitCount", schemaPath: "#/definitions/RawCountDto/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data8.text !== void 0) {
          if (typeof data8.text !== "string") {
            const err19 = { instancePath: instancePath + "/unitCount/text", schemaPath: "#/definitions/RawCountDto/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath: instancePath + "/unitCount", schemaPath: "#/definitions/RawCountDto/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.unitWidth !== void 0) {
      if (!validate19(data.unitWidth, { instancePath: instancePath + "/unitWidth", parentData: data, parentDataProperty: "unitWidth", rootData })) {
        vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err21 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err21];
    } else {
      vErrors.push(err21);
    }
    errors++;
  }
  validate99.errors = vErrors;
  return errors === 0;
}
var validateBootstrapProbeResult = validate105;
function validate105(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.normalizedCompartmentWidth === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "normalizedCompartmentWidth" }, message: "must have required property 'normalizedCompartmentWidth'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.normalizedUnitWidth === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "normalizedUnitWidth" }, message: "must have required property 'normalizedUnitWidth'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.requiredWidthMm === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requiredWidthMm" }, message: "must have required property 'requiredWidthMm'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.rowObjects === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "rowObjects" }, message: "must have required property 'rowObjects'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.widthCheck === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "widthCheck" }, message: "must have required property 'widthCheck'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.order === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.diagnostics === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "diagnostics" }, message: "must have required property 'diagnostics'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "diagnostics" || key0 === "normalizedCompartmentWidth" || key0 === "normalizedUnitWidth" || key0 === "order" || key0 === "requiredWidthMm" || key0 === "rowObjects" || key0 === "widthCheck")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.diagnostics !== void 0) {
      let data0 = data.diagnostics;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.fieldPath === void 0) {
              const err8 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/required", keyword: "required", params: { missingProperty: "fieldPath" }, message: "must have required property 'fieldPath'" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data1.code === void 0) {
              const err9 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (data1.reasonCode === void 0) {
              const err10 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/required", keyword: "required", params: { missingProperty: "reasonCode" }, message: "must have required property 'reasonCode'" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "code" || key1 === "fieldPath" || key1 === "reasonCode")) {
                const err11 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
            if (data1.code !== void 0) {
              if (typeof data1.code !== "string") {
                const err12 = { instancePath: instancePath + "/diagnostics/" + i0 + "/code", schemaPath: "#/definitions/Diagnostic/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            if (data1.fieldPath !== void 0) {
              if (typeof data1.fieldPath !== "string") {
                const err13 = { instancePath: instancePath + "/diagnostics/" + i0 + "/fieldPath", schemaPath: "#/definitions/Diagnostic/properties/fieldPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data1.reasonCode !== void 0) {
              if (typeof data1.reasonCode !== "string") {
                const err14 = { instancePath: instancePath + "/diagnostics/" + i0 + "/reasonCode", schemaPath: "#/definitions/Diagnostic/properties/reasonCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
          } else {
            const err15 = { instancePath: instancePath + "/diagnostics/" + i0, schemaPath: "#/definitions/Diagnostic/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
      } else {
        const err16 = { instancePath: instancePath + "/diagnostics", schemaPath: "#/properties/diagnostics/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.normalizedCompartmentWidth !== void 0) {
      if (!validate30(data.normalizedCompartmentWidth, { instancePath: instancePath + "/normalizedCompartmentWidth", parentData: data, parentDataProperty: "normalizedCompartmentWidth", rootData })) {
        vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
        errors = vErrors.length;
      }
    }
    if (data.normalizedUnitWidth !== void 0) {
      if (!validate30(data.normalizedUnitWidth, { instancePath: instancePath + "/normalizedUnitWidth", parentData: data, parentDataProperty: "normalizedUnitWidth", rootData })) {
        vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
        errors = vErrors.length;
      }
    }
    if (data.order !== void 0) {
      if (!validate38(data.order, { instancePath: instancePath + "/order", parentData: data, parentDataProperty: "order", rootData })) {
        vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
        errors = vErrors.length;
      }
    }
    if (data.requiredWidthMm !== void 0) {
      if (!validate47(data.requiredWidthMm, { instancePath: instancePath + "/requiredWidthMm", parentData: data, parentDataProperty: "requiredWidthMm", rootData })) {
        vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
        errors = vErrors.length;
      }
    }
    if (data.rowObjects !== void 0) {
      if (!validate50(data.rowObjects, { instancePath: instancePath + "/rowObjects", parentData: data, parentDataProperty: "rowObjects", rootData })) {
        vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
        errors = vErrors.length;
      }
    }
    if (data.widthCheck !== void 0) {
      if (!validate55(data.widthCheck, { instancePath: instancePath + "/widthCheck", parentData: data, parentDataProperty: "widthCheck", rootData })) {
        vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err17 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  validate105.errors = vErrors;
  return errors === 0;
}
var validateBootstrapFixture = validate112;
var schema14 = { "additionalProperties": false, "properties": { "diagnosticFields": { "items": { "type": "string" }, "type": "array" }, "packsToOrder": { "maximum": 4294967295, "minimum": 0, "type": ["integer", "null"] }, "requiredWidthMm": { "type": ["string", "null"] }, "suppliedUnits": { "maximum": 4294967295, "minimum": 0, "type": ["integer", "null"] }, "surplusUnits": { "maximum": 4294967295, "minimum": 0, "type": ["integer", "null"] }, "widthStatus": { "$ref": "#/definitions/CheckStatus" }, "xPositionsMm": { "items": { "type": "string" }, "type": ["array", "null"] } }, "required": ["widthStatus", "requiredWidthMm", "xPositionsMm", "packsToOrder", "suppliedUnits", "surplusUnits", "diagnosticFields"], "title": "FixtureExpected", "type": "object" };
function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.widthStatus === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "widthStatus" }, message: "must have required property 'widthStatus'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.requiredWidthMm === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requiredWidthMm" }, message: "must have required property 'requiredWidthMm'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.xPositionsMm === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "xPositionsMm" }, message: "must have required property 'xPositionsMm'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.packsToOrder === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "packsToOrder" }, message: "must have required property 'packsToOrder'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.suppliedUnits === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "suppliedUnits" }, message: "must have required property 'suppliedUnits'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.surplusUnits === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "surplusUnits" }, message: "must have required property 'surplusUnits'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.diagnosticFields === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "diagnosticFields" }, message: "must have required property 'diagnosticFields'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "diagnosticFields" || key0 === "packsToOrder" || key0 === "requiredWidthMm" || key0 === "suppliedUnits" || key0 === "surplusUnits" || key0 === "widthStatus" || key0 === "xPositionsMm")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.diagnosticFields !== void 0) {
      let data0 = data.diagnosticFields;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (typeof data0[i0] !== "string") {
            const err8 = { instancePath: instancePath + "/diagnosticFields/" + i0, schemaPath: "#/properties/diagnosticFields/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
      } else {
        const err9 = { instancePath: instancePath + "/diagnosticFields", schemaPath: "#/properties/diagnosticFields/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.packsToOrder !== void 0) {
      let data2 = data.packsToOrder;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2)) && data2 !== null) {
        const err10 = { instancePath: instancePath + "/packsToOrder", schemaPath: "#/properties/packsToOrder/type", keyword: "type", params: { type: schema14.properties.packsToOrder.type }, message: "must be integer,null" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 4294967295 || isNaN(data2)) {
          const err11 = { instancePath: instancePath + "/packsToOrder", schemaPath: "#/properties/packsToOrder/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (data2 < 0 || isNaN(data2)) {
          const err12 = { instancePath: instancePath + "/packsToOrder", schemaPath: "#/properties/packsToOrder/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
    }
    if (data.requiredWidthMm !== void 0) {
      let data3 = data.requiredWidthMm;
      if (typeof data3 !== "string" && data3 !== null) {
        const err13 = { instancePath: instancePath + "/requiredWidthMm", schemaPath: "#/properties/requiredWidthMm/type", keyword: "type", params: { type: schema14.properties.requiredWidthMm.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.suppliedUnits !== void 0) {
      let data4 = data.suppliedUnits;
      if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4)) && data4 !== null) {
        const err14 = { instancePath: instancePath + "/suppliedUnits", schemaPath: "#/properties/suppliedUnits/type", keyword: "type", params: { type: schema14.properties.suppliedUnits.type }, message: "must be integer,null" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 4294967295 || isNaN(data4)) {
          const err15 = { instancePath: instancePath + "/suppliedUnits", schemaPath: "#/properties/suppliedUnits/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        if (data4 < 0 || isNaN(data4)) {
          const err16 = { instancePath: instancePath + "/suppliedUnits", schemaPath: "#/properties/suppliedUnits/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
    }
    if (data.surplusUnits !== void 0) {
      let data5 = data.surplusUnits;
      if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5)) && data5 !== null) {
        const err17 = { instancePath: instancePath + "/surplusUnits", schemaPath: "#/properties/surplusUnits/type", keyword: "type", params: { type: schema14.properties.surplusUnits.type }, message: "must be integer,null" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      if (typeof data5 == "number" && isFinite(data5)) {
        if (data5 > 4294967295 || isNaN(data5)) {
          const err18 = { instancePath: instancePath + "/surplusUnits", schemaPath: "#/properties/surplusUnits/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (data5 < 0 || isNaN(data5)) {
          const err19 = { instancePath: instancePath + "/surplusUnits", schemaPath: "#/properties/surplusUnits/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
    }
    if (data.widthStatus !== void 0) {
      let data6 = data.widthStatus;
      if (typeof data6 !== "string") {
        const err20 = { instancePath: instancePath + "/widthStatus", schemaPath: "#/definitions/CheckStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      if (!(data6 === "pass" || data6 === "fail" || data6 === "unknown" || data6 === "not_applicable")) {
        const err21 = { instancePath: instancePath + "/widthStatus", schemaPath: "#/definitions/CheckStatus/enum", keyword: "enum", params: { allowedValues: schema15.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.xPositionsMm !== void 0) {
      let data7 = data.xPositionsMm;
      if (!Array.isArray(data7) && data7 !== null) {
        const err22 = { instancePath: instancePath + "/xPositionsMm", schemaPath: "#/properties/xPositionsMm/type", keyword: "type", params: { type: schema14.properties.xPositionsMm.type }, message: "must be array,null" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      if (Array.isArray(data7)) {
        const len1 = data7.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (typeof data7[i1] !== "string") {
            const err23 = { instancePath: instancePath + "/xPositionsMm/" + i1, schemaPath: "#/properties/xPositionsMm/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      }
    }
  } else {
    const err24 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err24];
    } else {
      vErrors.push(err24);
    }
    errors++;
  }
  validate12.errors = vErrors;
  return errors === 0;
}
function validate112(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.fixtureSchemaVersion === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "fixtureSchemaVersion" }, message: "must have required property 'fixtureSchemaVersion'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.caseId === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "caseId" }, message: "must have required property 'caseId'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.operation === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "operation" }, message: "must have required property 'operation'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.schemaVersion === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schemaVersion" }, message: "must have required property 'schemaVersion'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.input === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.engineContext === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "engineContext" }, message: "must have required property 'engineContext'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.expected === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "expected" }, message: "must have required property 'expected'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "caseId" || key0 === "engineContext" || key0 === "expected" || key0 === "fixtureSchemaVersion" || key0 === "input" || key0 === "operation" || key0 === "schemaVersion")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.caseId !== void 0) {
      if (typeof data.caseId !== "string") {
        const err8 = { instancePath: instancePath + "/caseId", schemaPath: "#/properties/caseId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.engineContext !== void 0) {
      let data1 = data.engineContext;
      if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
        if (data1.buildId === void 0) {
          const err9 = { instancePath: instancePath + "/engineContext", schemaPath: "#/definitions/EngineContext/required", keyword: "required", params: { missingProperty: "buildId" }, message: "must have required property 'buildId'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key1 in data1) {
          if (!(key1 === "buildId")) {
            const err10 = { instancePath: instancePath + "/engineContext", schemaPath: "#/definitions/EngineContext/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data1.buildId !== void 0) {
          if (typeof data1.buildId !== "string") {
            const err11 = { instancePath: instancePath + "/engineContext/buildId", schemaPath: "#/definitions/EngineContext/properties/buildId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
      } else {
        const err12 = { instancePath: instancePath + "/engineContext", schemaPath: "#/definitions/EngineContext/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.expected !== void 0) {
      if (!validate12(data.expected, { instancePath: instancePath + "/expected", parentData: data, parentDataProperty: "expected", rootData })) {
        vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
        errors = vErrors.length;
      }
    }
    if (data.fixtureSchemaVersion !== void 0) {
      let data4 = data.fixtureSchemaVersion;
      if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
        const err13 = { instancePath: instancePath + "/fixtureSchemaVersion", schemaPath: "#/properties/fixtureSchemaVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 4294967295 || isNaN(data4)) {
          const err14 = { instancePath: instancePath + "/fixtureSchemaVersion", schemaPath: "#/properties/fixtureSchemaVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (data4 < 0 || isNaN(data4)) {
          const err15 = { instancePath: instancePath + "/fixtureSchemaVersion", schemaPath: "#/properties/fixtureSchemaVersion/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
    }
    if (data.input !== void 0) {
      if (!validate14(data.input, { instancePath: instancePath + "/input", parentData: data, parentDataProperty: "input", rootData })) {
        vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
        errors = vErrors.length;
      }
    }
    if (data.operation !== void 0) {
      if (typeof data.operation !== "string") {
        const err16 = { instancePath: instancePath + "/operation", schemaPath: "#/properties/operation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.schemaVersion !== void 0) {
      let data7 = data.schemaVersion;
      if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
        const err17 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/properties/schemaVersion/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      if (typeof data7 == "number" && isFinite(data7)) {
        if (data7 > 4294967295 || isNaN(data7)) {
          const err18 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/properties/schemaVersion/maximum", keyword: "maximum", params: { comparison: "<=", limit: 4294967295 }, message: "must be <= 4294967295" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (data7 < 0 || isNaN(data7)) {
          const err19 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/properties/schemaVersion/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
    }
  } else {
    const err20 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err20];
    } else {
      vErrors.push(err20);
    }
    errors++;
  }
  validate112.errors = vErrors;
  return errors === 0;
}
export {
  validateBootstrapFixture,
  validateBootstrapProbeDto,
  validateBootstrapProbeResult,
  validateProtocolRequest,
  validateProtocolResponse
};
