export type WalletPassRegistration = {
  registrationReference: string;
  bibNumber: string | null;
  firstName: string;
  lastName: string;
  eventName: string;
  eventStartsAt: string;
  venueName: string;
  raceName: string;
  categoryName: string | null;
  waveName: string | null;
  teamName: string | null;
};

export type WalletPassField = { label?: string; value: string; changeMessage?: string };
export type WalletPassSpec = {
  barcodeValue: string;
  barcodeFormat: "QR";
  barcodeAltText: string;
  logoText: string;
  organizationName: string;
  description: string;
  primaryFields: WalletPassField[];
  secondaryFields: WalletPassField[];
  headerFields: WalletPassField[];
  backFields: WalletPassField[];
  sharingProhibited: true;
  colorPreset: "purple";
};

export function buildWalletPassSpec(registration: WalletPassRegistration, notification = " "): WalletPassSpec {
  const date = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(new Date(registration.eventStartsAt));
  const athleteName = `${registration.firstName} ${registration.lastName}`.trim();
  return {
    barcodeValue: registration.registrationReference,
    barcodeFormat: "QR",
    barcodeAltText: registration.registrationReference,
    logoText: "3F Striders",
    organizationName: "3F Striders",
    description: `${registration.eventName} race entry for ${athleteName}`,
    primaryFields: [{ label: "EVENT", value: registration.eventName, changeMessage: "Event updated: %@" }],
    secondaryFields: [
      { label: "RACE", value: registration.raceName, changeMessage: "Race updated: %@" },
      { label: "START", value: date, changeMessage: "Start time updated: %@" },
    ],
    headerFields: [{ label: registration.bibNumber ? "BIB" : "STATUS", value: registration.bibNumber ?? "CONFIRMED", changeMessage: registration.bibNumber ? "Your bib number is %@" : undefined }],
    backFields: [
      { label: "Athlete", value: athleteName },
      { label: "Venue", value: registration.venueName, changeMessage: "Venue updated: %@" },
      { label: "Category", value: registration.categoryName ?? "—" },
      { label: "Wave", value: registration.waveName ?? "—" },
      { label: "Team", value: registration.teamName ?? "—" },
      { label: "Registration", value: registration.registrationReference },
      { label: "Notifications", value: notification, changeMessage: "%@" },
    ],
    sharingProhibited: true,
    colorPreset: "purple",
  };
}
