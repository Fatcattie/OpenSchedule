Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function addAutoIpAddressToSession(session) {
  if ("aggregates" in session) {
    if (session.attrs?.["ip_address"] === void 0) {
      session.attrs = {
        ...session.attrs,
        ip_address: "{{auto}}"
      };
    }
  } else {
    if (session.ipAddress === void 0) {
      session.ipAddress = "{{auto}}";
    }
  }
}

exports.addAutoIpAddressToSession = addAutoIpAddressToSession;
//# sourceMappingURL=ipAddress.js.map
