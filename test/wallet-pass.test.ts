import { describe, expect, it } from "vitest";
import { buildWalletPassSpec } from "../app/domain/wallet/pass-spec";

const registration = {
  registrationReference: "3FS-AB12CD34",
  bibNumber: null,
  firstName: "Aisha",
  lastName: "Khan",
  eventName: "Dubai Sunrise Run",
  eventStartsAt: "2027-02-01T02:30:00.000Z",
  venueName: "Meydan Track",
  raceName: "10 km",
  categoryName: "Open",
  waveName: "Wave A",
  teamName: null,
};

describe("wallet pass specification", () => {
  it("uses the registration reference as the QR value and seeds the notification field", () => {
    const pass = buildWalletPassSpec(registration);
    expect(pass.barcodeValue).toBe("3FS-AB12CD34");
    expect(pass.barcodeFormat).toBe("QR");
    expect(pass.backFields.at(-1)).toEqual({ label: "Notifications", value: " ", changeMessage: "%@" });
    expect(pass.sharingProhibited).toBe(true);
  });

  it("shows a bib after assignment without including medical information", () => {
    const pass = buildWalletPassSpec({ ...registration, bibNumber: "A-104" }, "Bib A-104 has been assigned");
    expect(pass.headerFields[0]).toMatchObject({ label: "BIB", value: "A-104" });
    expect(JSON.stringify(pass)).not.toMatch(/medical|emergency/i);
  });
});
