"use client";

import { Clause, Entity, LegalPage } from "@/app/landing/_components/legal-page";
import { useT } from "@/lib/i18n/provider";

/**
 * The terms of use.
 *
 * Written for what this product actually is: software you install and run
 * yourself, against your own database, with your own model keys. That shape
 * decides most of the clauses — there is no uptime to promise on an
 * installation we do not operate, and no data to be responsible for on a
 * server we cannot reach.
 */
export function Terms() {
  const t = useT();

  return (
    <LegalPage updated={t("terms.updated")} title={t("terms.title")} lede={t("terms.lede")}>
      <Clause title={t("terms.whoWeAre.title")}>
        <p>
          {t("terms.whoWeAre.p1a")}
          <Entity field="name" />
          {t("terms.whoWeAre.p1b")}
          <Entity field="address" />
          {t("terms.whoWeAre.p1c")}
          <Entity field="email" />.
        </p>
      </Clause>

      <Clause title={t("terms.permitted.title")}>
        <p>{t("terms.permitted.body")}</p>
      </Clause>

      <Clause title={t("terms.yourSide.title")}>
        <p>{t("terms.yourSide.p1")}</p>
        <p>{t("terms.yourSide.p2")}</p>
      </Clause>

      <Clause title={t("terms.thirdParty.title")}>
        <p>{t("terms.thirdParty.body")}</p>
      </Clause>

      <Clause title={t("terms.acceptableUse.title")}>
        <p>{t("terms.acceptableUse.body")}</p>
      </Clause>

      <Clause title={t("terms.warranties.title")}>
        <p>{t("terms.warranties.p1")}</p>
        <p>{t("terms.warranties.p2")}</p>
      </Clause>

      <Clause title={t("terms.liability.title")}>
        <p>{t("terms.liability.p1")}</p>
        <p>{t("terms.liability.p2")}</p>
      </Clause>

      <Clause title={t("terms.paidPlans.title")}>
        <p>{t("terms.paidPlans.body")}</p>
      </Clause>

      <Clause title={t("terms.enterpriseLicense.title")}>
        <p>{t("terms.enterpriseLicense.p1")}</p>
        <p>{t("terms.enterpriseLicense.p2")}</p>
        <p>{t("terms.enterpriseLicense.p3")}</p>
      </Clause>

      <Clause title={t("terms.changes.title")}>
        <p>{t("terms.changes.body")}</p>
      </Clause>

      <Clause title={t("terms.governingLaw.title")}>
        <p>
          {t("terms.governingLaw.p1a")}
          <Entity field="jurisdiction" />
          {t("terms.governingLaw.p1b")}
        </p>
      </Clause>
    </LegalPage>
  );
}
