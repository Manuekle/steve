"use client";

import { Clause, Entity, LegalPage } from "@/app/landing/_components/legal-page";
import { useT } from "@/lib/i18n/provider";

/**
 * The privacy notice.
 *
 * Every factual claim below is checkable in this repository: the durable
 * state lives in the operator's own PostgreSQL, the sandbox runs with
 * `networkPolicy: "deny-all"`, traces leave over OpenTelemetry to a collector
 * the operator runs, model keys are stored on the operator's machine, and the
 * inbox exports contacts as CSV. Nothing here describes a data flow the code
 * does not have — which is the part of a privacy notice that is usually wrong,
 * and the part a lawyer cannot check for you.
 */
export function Privacy() {
  const t = useT();

  return (
    <LegalPage updated={t("privacy.updated")} title={t("privacy.title")} lede={t("privacy.lede")}>
      <Clause title={t("privacy.whoProcesses.title")}>
        <p>
          {t("privacy.whoProcesses.p1a")}
          <Entity field="name" />
          {t("privacy.whoProcesses.p1b")}
          <Entity field="address" />
          {t("privacy.whoProcesses.p1c")}
        </p>
        <p>{t("privacy.whoProcesses.p2")}</p>
      </Clause>

      <Clause title={t("privacy.dataStored.title")}>
        <p>{t("privacy.dataStored.p1")}</p>
        <p>{t("privacy.dataStored.p2")}</p>
      </Clause>

      <Clause title={t("privacy.dataLeaving.title")}>
        <p>{t("privacy.dataLeaving.p1")}</p>
        <p>{t("privacy.dataLeaving.p2")}</p>
      </Clause>

      <Clause title={t("privacy.metaData.title")}>
        <p>{t("privacy.metaData.body")}</p>
      </Clause>

      <Clause title={t("privacy.retention.title")}>
        <p>{t("privacy.retention.body")}</p>
      </Clause>

      <Clause title={t("privacy.accessPortability.title")}>
        <p>{t("privacy.accessPortability.p1")}</p>
        <p>
          {t("privacy.accessPortability.p2a")}
          <Entity field="email" />.
        </p>
      </Clause>

      <Clause title={t("privacy.cookies.title")}>
        <p>{t("privacy.cookies.body")}</p>
      </Clause>

      <Clause title={t("privacy.minors.title")}>
        <p>{t("privacy.minors.body")}</p>
      </Clause>

      <Clause title={t("privacy.changes.title")}>
        <p>{t("privacy.changes.body")}</p>
      </Clause>
    </LegalPage>
  );
}
