# **Stevedoring Operations Reference: Colonels Island / Brunswick**

Compiled: 2026-09-24 (rev. 2: cutoff fields confirmed). This is a summary only. The VSA Operating Protocol PDF and official SOPs are authoritative when added.

## **Virtual Stevedore Assistant (VSA)**

* Started March 2025 as an evolving template for automobile discharge/load-back work. It automates repetitive work, tracks operational data, and cuts manual processes.  
* Formalized September 2026 into an auditable operating system for automobile discharge, High & Heavy, and load-back at Colonels Island.  
* Purpose: reduce the superintendent's mental workload while keeping an accurate, auditable operational picture.  
* **v1.0:** source hierarchy, vessel isolation, fact/estimate classification, document reconciliation, vehicle/deck-clearance checks, load-list authority, forecast-vs-actual tracking.  
* **v1.1 (2026-09-21):** field-specific shutdown timing, 07:00 safety-meeting logic, noon/18:00 breaks, "short hour" production behavior.  
* Vessel initialization command: **"New vessel \- initialize operation."**  
* The template records start, break, and end times only. Break policy lives in the knowledge base, not the template. "Stevedoring Company" was removed from the template.  
* Keep an abbreviated-terms glossary.  
* Open directions: offline availability; an App Store app (evaluating approaches such as Claude Code \+ Expo).

## **Core rules**

* **One Vessel, One Chat.** Each vessel is an independent job record. Never import live data from another vessel unless explicitly asked. Historical ops are for clearly labeled benchmarking only.  
* **SOPs first.** Operational answers cite the SOP page/item with a verifiable quote, link, or screenshot. Never assume or invent.  
* **Classify every value** as Source Fact, User Report, Calculated Value, Forecast/Estimate, or Unknown. Never turn an estimate into a recorded fact.  
* Don't guess unreadable or ambiguous values. Flag the ambiguity instead.  
* **Load list is authoritative** over the game plan on quantity unless explicitly overridden.  
* Automobile analysis excludes heavy equipment, while staying aware of it.  
* Hourly updates: subtract from the total and state the remaining count.  
* Distances are based on berth, discharge yard, and load-back yard.

## **Time & breaks**

* The 5-hour break rule applies to every ship, for both discharge and load-back.  
* Breaks at **12:00** and **18:00**. The hours before them (11:00–12:00, 17:00–18:00) are **short hours** with expected production dips.  
* A 07:00 start includes a 10-minute safety meeting.  
* Pre-break stop cutoffs (confirmed by Colby 2026-09-24):  
  * **Southside — 30 min before break:** Zone 1 (MB Field), MBZ (Mercedes), Zone T, Zone V. Stop at 11:30 and 17:30.  
  * **Northside — 15 min before break:** all other fields. Stop at 11:45 and 17:45.

## **Terminology**

* Formal names: **Zone 1 (MB Field)** and **MBZ (Mercedes)**.  
* In live ops, "MB Field" said alone means **MBZ (Mercedes)**. "Zone 1" means Zone 1 (MB Field).  
* Terminal sides are always called **Northside** and **Southside** in answers and reports.

## **Terminal master map**

* Built from four images: the IAP wall map, a vector map with hand-drawn red boundaries, a satellite screenshot (base layer), and an older aerial with parcel/operator labels (WWS, TICO, SSA, G\&W).  
* Where sources disagree, the vector map wins on Zone 6/7 placement. Keep the red numbered markers 1–7.  
* Renumbering: old Zone 7 → Zone 9, old Zone 8 → Zone 7, old Zone 9 → Zone 8\. Protocol v1.1 Appendix D prints Zones 7-9 under the old numbers; the corrected distances are in the Project Instructions (rev 3)\. Yard 3 was split off old Site 4; Site 4 is still its own lot\.  
* Goal: an interactive map with selectable zones/yards/sites, hard borders, and a legend.

