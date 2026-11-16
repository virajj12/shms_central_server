"""Executive PDF compliance certificate generator."""

from __future__ import annotations

import math
import os
import re
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NAVY = colors.HexColor("#1e293b")
NEUTRAL = colors.HexColor("#0f172a")
EMERALD = colors.HexColor("#059669")
AMBER = colors.HexColor("#d97706")
RED = colors.HexColor("#dc2626")
SLATE_600 = colors.HexColor("#475569")
SLATE_500 = colors.HexColor("#64748b")
SLATE_300 = colors.HexColor("#cbd5e1")
SLATE_200 = colors.HexColor("#e2e8f0")
SLATE_50 = colors.HexColor("#f8fafc")
WHITE = colors.white
EMERALD_BG = colors.HexColor("#ecfdf5")
AMBER_BG = colors.HexColor("#fffbeb")
RED_BG = colors.HexColor("#fef2f2")

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 0.6 * inch
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
_PAGE_RE = re.compile(rb"/Type\s*/Page\b(?!s)")


def _clean_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    if not text:
        return fallback
    return text.encode("latin-1", "replace").decode("latin-1")


def _escaped(value: Any, fallback: str = "") -> str:
    return escape(_clean_text(value, fallback))


def _number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        if isinstance(value, str):
            value = value.strip().replace(",", "").rstrip("%")
            if not value:
                return default
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return number


def _integer(value: Any, default: int = 0) -> int:
    try:
        return int(round(_number(value, float(default))))
    except (TypeError, ValueError, OverflowError):
        return default


def _grade(score: float) -> tuple[str, str, Any, Any]:
    if score >= 90.0:
        return "A", "EXCELLENT COMPLIANCE", EMERALD, EMERALD_BG
    if score >= 75.0:
        return "B", "SATISFACTORY", AMBER, AMBER_BG
    return "C", "ACTION REQUIRED", RED, RED_BG


def _status_palette(status: str) -> tuple[Any, Any]:
    key = status.lower()
    if any(token in key for token in ("critical", "action", "fail", "non-compliant", "noncompliant", "high", "alert")):
        return RED, RED_BG
    if any(token in key for token in ("caution", "warn", "review", "monitor", "medium")):
        return AMBER, AMBER_BG
    if any(token in key for token in ("compliant", "pass", "clear", "good", "ok", "low")):
        return EMERALD, EMERALD_BG
    return SLATE_500, SLATE_50


def _make_styles(accent: Any) -> dict[str, ParagraphStyle]:
    return {
        "header_title": ParagraphStyle(
            "HeaderTitle",
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=WHITE,
            spaceAfter=3,
        ),
        "header_sub": ParagraphStyle(
            "HeaderSub",
            fontName="Helvetica",
            fontSize=7.8,
            leading=9.5,
            textColor=SLATE_300,
        ),
        "header_label": ParagraphStyle(
            "HeaderLabel",
            fontName="Helvetica-Bold",
            fontSize=6.3,
            leading=7.8,
            textColor=SLATE_300,
            alignment=TA_RIGHT,
            spaceBefore=2,
        ),
        "header_value": ParagraphStyle(
            "HeaderValue",
            fontName="Helvetica-Bold",
            fontSize=8.3,
            leading=10,
            textColor=WHITE,
            alignment=TA_RIGHT,
        ),
        "meta_label": ParagraphStyle(
            "MetaLabel",
            fontName="Helvetica-Bold",
            fontSize=6.3,
            leading=7.8,
            textColor=SLATE_500,
            spaceAfter=2,
        ),
        "meta_value": ParagraphStyle(
            "MetaValue",
            fontName="Helvetica-Bold",
            fontSize=9.2,
            leading=11,
            textColor=NEUTRAL,
        ),
        "section": ParagraphStyle(
            "Section",
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=NAVY,
        ),
        "grade": ParagraphStyle(
            "Grade",
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=23,
            textColor=WHITE,
        ),
        "score_label": ParagraphStyle(
            "ScoreLabel",
            fontName="Helvetica-Bold",
            fontSize=6.3,
            leading=7.8,
            textColor=SLATE_500,
            alignment=TA_RIGHT,
            spaceAfter=2,
        ),
        "score": ParagraphStyle(
            "Score",
            fontName="Helvetica-Bold",
            fontSize=23,
            leading=25,
            textColor=accent,
            alignment=TA_RIGHT,
        ),
        "kpi_value": ParagraphStyle(
            "KpiValue",
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=22,
            alignment=TA_CENTER,
            textColor=NEUTRAL,
        ),
        "kpi_label": ParagraphStyle(
            "KpiLabel",
            fontName="Helvetica-Bold",
            fontSize=6.3,
            leading=7.8,
            alignment=TA_CENTER,
            textColor=SLATE_500,
        ),
        "table_head": ParagraphStyle(
            "TableHead",
            fontName="Helvetica-Bold",
            fontSize=6.6,
            leading=8,
            alignment=TA_CENTER,
            textColor=WHITE,
        ),
        "table_head_left": ParagraphStyle(
            "TableHeadLeft",
            fontName="Helvetica-Bold",
            fontSize=6.6,
            leading=8,
            alignment=TA_LEFT,
            textColor=WHITE,
        ),
        "station": ParagraphStyle(
            "Station",
            fontName="Helvetica-Bold",
            fontSize=8.3,
            leading=10,
            textColor=NEUTRAL,
        ),
        "infraction": ParagraphStyle(
            "Infraction",
            fontName="Helvetica",
            fontSize=7.8,
            leading=9.5,
            alignment=TA_CENTER,
            textColor=SLATE_600,
        ),
        "cell": ParagraphStyle(
            "Cell",
            fontName="Helvetica",
            fontSize=8,
            leading=9.5,
            alignment=TA_CENTER,
            textColor=SLATE_600,
        ),
        "notes_label": ParagraphStyle(
            "NotesLabel",
            fontName="Helvetica-Bold",
            fontSize=6.3,
            leading=7.8,
            textColor=SLATE_500,
            spaceAfter=3,
        ),
        "notes": ParagraphStyle(
            "Notes",
            fontName="Helvetica",
            fontSize=8,
            leading=10.5,
            textColor=SLATE_600,
        ),
        "stamp_badge": ParagraphStyle(
            "StampBadge",
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9.5,
            alignment=TA_CENTER,
            textColor=WHITE,
        ),
        "stamp_text": ParagraphStyle(
            "StampText",
            fontName="Helvetica-Bold",
            fontSize=7.4,
            leading=9.5,
            alignment=TA_CENTER,
            textColor=EMERALD,
        ),
        "role": ParagraphStyle(
            "Role",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=NAVY,
        ),
        "signature": ParagraphStyle(
            "Signature",
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=SLATE_600,
        ),
        "tiny": ParagraphStyle(
            "Tiny",
            fontName="Helvetica",
            fontSize=6.5,
            leading=8,
            textColor=SLATE_500,
        ),
    }


def _normalize_stations(report_data: dict, limit: int = 8) -> tuple[list[dict], int]:
    raw = report_data.get("stations_breakdown")
    if not isinstance(raw, list):
        return [], 0

    stations = []
    for item in raw:
        source = item if isinstance(item, dict) else {}
        pests = _integer(source.get("pests"))
        hygiene = _integer(source.get("hygiene"))
        status = _clean_text(source.get("status"), "")
        if not status:
            if pests > 0:
                status = "Caution"
            elif hygiene > 0:
                status = "Review"
            else:
                status = "Compliant"
        stations.append(
            {
                "station": _clean_text(source.get("station"), "Unassigned Station"),
                "cameras": _integer(source.get("cameras")),
                "pests": pests,
                "hygiene": hygiene,
                "status": status,
            }
        )

    total = len(stations)
    return stations[: max(0, limit)], total


def _signature_block(role: str, styles: dict[str, ParagraphStyle]) -> list:
    return [
        Paragraph(escape(role), styles["role"]),
        Spacer(1, 22),
        Paragraph("Signature: _________________________________", styles["signature"]),
        Spacer(1, 7),
        Paragraph("Date: ______________________________________", styles["signature"]),
    ]


def _fallback_pdf(path: str, report_id: str, generated_at: str, error: str) -> None:
    canvas = Canvas(path, pagesize=A4)
    canvas.setTitle("Food Safety Audit Certificate")
    canvas.setAuthor("Smart Hotel AI Surveillance")
    canvas.setFont("Helvetica-Bold", 15)
    canvas.setFillColor(NAVY)
    canvas.drawString(MARGIN, PAGE_HEIGHT - MARGIN, "Food Safety Audit Certificate")
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(SLATE_600)
    canvas.drawString(MARGIN, PAGE_HEIGHT - MARGIN - 24, f"Report ID: {report_id}")
    canvas.drawString(MARGIN, PAGE_HEIGHT - MARGIN - 38, f"Generated: {generated_at}")
    message = _clean_text(error, "The full compliance report could not be rendered.")
    canvas.drawString(MARGIN, PAGE_HEIGHT - MARGIN - 66, message[:120])
    canvas.showPage()
    canvas.save()


def _count_pdf_pages(path: str) -> int:
    try:
        with open(path, "rb") as handle:
            payload = handle.read()
        return len(_PAGE_RE.findall(payload))
    except OSError:
        return 0


def _generate_compliance_pdf_once(
    report_data: dict,
    output_path: str,
    station_limit: int,
    notes_limit: int,
) -> str:
    data = report_data if isinstance(report_data, dict) else {}

    target = _clean_text(output_path, "compliance_report.pdf")
    if not os.path.splitext(target)[1]:
        target += ".pdf"
    absolute_path = os.path.abspath(target)

    report_id = _clean_text(data.get("report_id"), "AUDIT-UNASSIGNED")
    hotel_name = _clean_text(data.get("hotel_name"), "Unknown Hotel")
    location = _clean_text(data.get("location"), "Unassigned Location")
    audit_period = _clean_text(data.get("audit_period"), "Not specified")
    generated_at = _clean_text(
        data.get("generated_at"),
        "Not specified",
    )
    total_hours = _number(data.get("total_camera_hours"), 0.0)
    total_violations = _integer(data.get("total_violations"))
    pest_incursions = _integer(data.get("pest_incursions"))
    hygiene_breaches = _integer(data.get("hygiene_breaches"))
    score = max(0.0, min(100.0, _number(data.get("compliance_score"), 0.0)))
    station_rows, total_stations = _normalize_stations(data, station_limit)
    notes = _clean_text(
        data.get("inspector_notes"),
        "No inspector notes were supplied for this audit period.",
    )
    if len(notes) > notes_limit:
        notes = notes[: max(0, notes_limit - 3)].rstrip() + "..."

    grade_letter, grade_title, accent, accent_bg = _grade(score)
    styles = _make_styles(accent)

    def footer(canvas: Canvas, doc: Any) -> None:
        canvas.saveState()
        canvas.setStrokeColor(SLATE_200)
        canvas.setLineWidth(0.6)
        canvas.line(MARGIN, 32, PAGE_WIDTH - MARGIN, 32)
        canvas.setFont("Helvetica", 6.3)
        canvas.setFillColor(SLATE_500)
        canvas.drawString(
            MARGIN,
            22,
            f"{_clean_text(report_id)}  |  Generated {_clean_text(generated_at)}",
        )
        canvas.drawRightString(
            PAGE_WIDTH - MARGIN,
            22,
            "Automated AMFV Surveillance Verification  |  Page 1 of 1",
        )
        canvas.restoreState()

    header_left = [
        Paragraph(
            "Smart Hotel AI Surveillance \u2014 Food Safety Audit Certificate",
            styles["header_title"],
        ),
        Paragraph(
            "Food Safety &amp; Kitchen Hygiene Compliance Report",
            styles["header_sub"],
        ),
    ]
    header_right = [
        Paragraph("REPORT ID", styles["header_label"]),
        Paragraph(escape(report_id), styles["header_value"]),
        Paragraph("GENERATED", styles["header_label"]),
        Paragraph(escape(generated_at), styles["header_value"]),
    ]
    header = Table(
        [[header_left, header_right]],
        colWidths=[CONTENT_WIDTH * 0.68, CONTENT_WIDTH * 0.32],
    )
    header.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 13),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
            ]
        )
    )
    accent_bar = Table([[""]], colWidths=[CONTENT_WIDTH], rowHeights=[4])
    accent_bar.setStyle(
        TableStyle([("BACKGROUND", (0, 0), (-1, -1), accent)])
    )

    hotel_cell = [
        Paragraph("HOTEL", styles["meta_label"]),
        Paragraph(escape(hotel_name), styles["meta_value"]),
    ]
    period_cell = [
        Paragraph("AUDIT PERIOD", styles["meta_label"]),
        Paragraph(escape(audit_period), styles["meta_value"]),
    ]
    location_cell = [
        Paragraph("BRANCH / LOCATION", styles["meta_label"]),
        Paragraph(escape(location), styles["meta_value"]),
    ]
    hours_cell = [
        Paragraph("MONITORED HOURS", styles["meta_label"]),
        Paragraph(f"{total_hours:,.1f} camera-hours", styles["meta_value"]),
    ]
    info_table = Table(
        [[hotel_cell, period_cell], [location_cell, hours_cell]],
        colWidths=[CONTENT_WIDTH * 0.58, CONTENT_WIDTH * 0.42],
    )
    info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SLATE_50),
                ("BOX", (0, 0), (-1, -1), 0.8, SLATE_200),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, SLATE_200),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    grade_cell = Paragraph(
        f'<font size="20">GRADE {grade_letter}</font>  \u2014  {grade_title}',
        styles["grade"],
    )
    score_cell = [
        Paragraph("COMPLIANCE SCORE", styles["score_label"]),
        Paragraph(f"{score:.1f}%", styles["score"]),
    ]
    grade_table = Table(
        [[grade_cell, score_cell]],
        colWidths=[CONTENT_WIDTH * 0.70, CONTENT_WIDTH * 0.30],
    )
    grade_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), accent),
                ("BACKGROUND", (1, 0), (1, 0), accent_bg),
                ("BOX", (0, 0), (-1, -1), 0.8, accent),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (0, 0), 14),
                ("RIGHTPADDING", (0, 0), (0, 0), 10),
                ("LEFTPADDING", (1, 0), (1, 0), 10),
                ("RIGHTPADDING", (1, 0), (1, 0), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    pest_value_style = ParagraphStyle(
        "KpiPestValue",
        parent=styles["kpi_value"],
        textColor=RED if pest_incursions else NEUTRAL,
    )
    hygiene_value_style = ParagraphStyle(
        "KpiHygieneValue",
        parent=styles["kpi_value"],
        textColor=AMBER if hygiene_breaches else NEUTRAL,
    )
    score_value_style = ParagraphStyle(
        "KpiScoreValue",
        parent=styles["kpi_value"],
        textColor=accent,
    )
    kpi_table = Table(
        [
            [
                Paragraph(str(total_violations), styles["kpi_value"]),
                Paragraph(str(pest_incursions), pest_value_style),
                Paragraph(str(hygiene_breaches), hygiene_value_style),
                Paragraph(f"{score:.1f}%", score_value_style),
            ],
            [
                Paragraph("TOTAL VIOLATIONS", styles["kpi_label"]),
                Paragraph("PEST INCURSIONS", styles["kpi_label"]),
                Paragraph("PPE BREACHES", styles["kpi_label"]),
                Paragraph("COMPLIANCE %", styles["kpi_label"]),
            ],
        ],
        colWidths=[CONTENT_WIDTH / 4] * 4,
    )
    kpi_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("BOX", (0, 0), (-1, -1), 0.8, SLATE_200),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, SLATE_200),
                ("LINEABOVE", (0, 0), (-1, 0), 2, NAVY),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
                ("TOPPADDING", (0, 1), (-1, 1), 0),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
            ]
        )
    )

    station_data = [
        [
            Paragraph("STATION NAME", styles["table_head_left"]),
            Paragraph("MONITORED CAMERAS", styles["table_head"]),
            Paragraph("INFRACTIONS", styles["table_head"]),
            Paragraph("RISK STATUS", styles["table_head"]),
        ]
    ]
    if station_rows:
        display_stations = station_rows
    else:
        display_stations = [
            {
                "station": "No station data available",
                "cameras": 0,
                "pests": 0,
                "hygiene": 0,
                "status": "Not Available",
            }
        ]

    station_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.8, SLATE_200),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, SLATE_200),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (3, 1), (3, -1), "CENTER"),
    ]
    for index, station in enumerate(display_stations, start=1):
        total_infractions = station["pests"] + station["hygiene"]
        infraction_text = (
            f"<b>{total_infractions}</b> total"
            f"<br/><font size=6.8 color='#64748b'>"
            f"{station['pests']} pest / {station['hygiene']} hygiene"
            f"</font>"
        )
        station_data.append(
            [
                Paragraph(escape(station["station"]), styles["station"]),
                Paragraph(str(station["cameras"]), styles["cell"]),
                Paragraph(infraction_text, styles["infraction"]),
                _clean_text(station["status"], "Review").upper(),
            ]
        )
        status_fg, status_bg = _status_palette(station["status"])
        station_commands.extend(
            [
                (
                    "BACKGROUND",
                    (0, index),
                    (-1, index),
                    WHITE if index % 2 == 1 else SLATE_50,
                ),
                ("BACKGROUND", (3, index), (3, index), status_bg),
                ("TEXTCOLOR", (3, index), (3, index), status_fg),
                ("FONTNAME", (3, index), (3, index), "Helvetica-Bold"),
                ("FONTSIZE", (3, index), (3, index), 6.8),
            ]
        )
    station_table = Table(
        station_data,
        colWidths=[
            CONTENT_WIDTH * 0.36,
            CONTENT_WIDTH * 0.16,
            CONTENT_WIDTH * 0.30,
            CONTENT_WIDTH * 0.18,
        ],
        repeatRows=1,
    )
    station_table.setStyle(TableStyle(station_commands))

    notes_box = Table(
        [
            [
                [
                    Paragraph("INSPECTOR NOTES", styles["notes_label"]),
                    Paragraph(escape(notes), styles["notes"]),
                ]
            ]
        ],
        colWidths=[CONTENT_WIDTH],
    )
    notes_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SLATE_50),
                ("BOX", (0, 0), (-1, -1), 0.7, SLATE_200),
                ("LINEBEFORE", (0, 0), (0, 0), 3, NAVY),
                ("LEFTPADDING", (0, 0), (-1, -1), 11),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    inner_width = CONTENT_WIDTH - 20
    stamp = Table(
        [
            [
                Paragraph("AMFV VERIFIED", styles["stamp_badge"]),
                Paragraph(
                    "Automated AMFV Continuous Surveillance Verification",
                    styles["stamp_text"],
                ),
            ]
        ],
        colWidths=[94, inner_width - 94],
    )
    stamp.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), EMERALD_BG),
                ("BACKGROUND", (0, 0), (0, 0), EMERALD),
                ("BOX", (0, 0), (-1, -1), 0.8, EMERALD),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    signatures = Table(
        [
            [
                _signature_block("Hotel General Manager / Executive Chef", styles),
                _signature_block("Quality & Food Safety Auditor", styles),
            ]
        ],
        colWidths=[inner_width / 2, inner_width / 2],
    )
    signatures.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBEFORE", (1, 0), (1, 0), 0.6, SLATE_200),
                ("LEFTPADDING", (0, 0), (0, 0), 2),
                ("RIGHTPADDING", (0, 0), (0, 0), 12),
                ("LEFTPADDING", (1, 0), (1, 0), 12),
                ("RIGHTPADDING", (1, 0), (1, 0), 2),
            ]
        )
    )

    signoff_box = Table(
        [[[stamp, Spacer(1, 11), signatures]]],
        colWidths=[CONTENT_WIDTH],
    )
    signoff_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SLATE_50),
                ("BOX", (0, 0), (-1, -1), 0.7, SLATE_200),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )

    flowables = [
        header,
        accent_bar,
        Spacer(1, 10),
        info_table,
        Spacer(1, 9),
        grade_table,
        Spacer(1, 9),
        kpi_table,
        Spacer(1, 12),
        Paragraph("STATION BREAKDOWN", styles["section"]),
        Spacer(1, 5),
        station_table,
    ]
    if total_stations > len(station_rows):
        flowables.extend(
            [
                Spacer(1, 3),
                Paragraph(
                    f"Showing {len(station_rows)} of {total_stations} monitored stations.",
                    styles["tiny"],
                ),
            ]
        )
    flowables.extend(
        [
            Spacer(1, 10),
            notes_box,
            Spacer(1, 12),
            Paragraph("FORMAL SIGN-OFF", styles["section"]),
            Spacer(1, 5),
            signoff_box,
        ]
    )

    try:
        parent = os.path.dirname(absolute_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        document = SimpleDocTemplate(
            absolute_path,
            pagesize=A4,
            leftMargin=MARGIN,
            rightMargin=MARGIN,
            topMargin=MARGIN,
            bottomMargin=MARGIN,
            pageCompression=0,
            title="Food Safety Audit Certificate",
            author="Smart Hotel AI Surveillance",
            subject="Food Safety & Kitchen Hygiene Compliance Report",
            creator="Smart Hotel AI Surveillance",
        )
        document.build(flowables, onFirstPage=footer, onLaterPages=footer)
    except Exception as exc:
        print(f"[pdf_report] Failed to generate compliance PDF: {exc}")
        try:
            _fallback_pdf(absolute_path, report_id, generated_at, str(exc))
        except Exception as fallback_exc:
            print(f"[pdf_report] Fallback PDF generation failed: {fallback_exc}")

    return absolute_path


def generate_compliance_pdf(
    report_data: dict,
    output_path: str = "compliance_report.pdf",
) -> str:
    """
    Generates a formal 1-page executive PDF compliance certificate.

    Args:
        report_data: Dictionary containing fleet audit metrics.
        output_path: Destination filepath for the generated PDF.

    Returns:
        Absolute path to the generated PDF document.
    """
    station_limits = [8, 5, 3]
    notes_limits = [320, 200, 120]

    for s_lim, n_lim in zip(station_limits, notes_limits):
        path = _generate_compliance_pdf_once(
            report_data=report_data,
            output_path=output_path,
            station_limit=s_lim,
            notes_limit=n_lim,
        )
        if _count_pdf_pages(path) <= 1:
            return path

    return path


if __name__ == "__main__":
    sample_report = {
        "report_id": "AUDIT-2026-NYC-0092",
        "hotel_name": "Grand Palace Hotel & Suites",
        "location": "Main Kitchen & Food Prep Facility",
        "audit_period": "Nov 06, 2026 - Nov 13, 2026",
        "generated_at": "2026-11-13 18:30:00",
        "total_camera_hours": 336.5,
        "total_violations": 14,
        "pest_incursions": 1,
        "hygiene_breaches": 13,
        "compliance_score": 93.5,
        "stations_breakdown": [
            {
                "station": "Food Prep Counter",
                "cameras": 2,
                "pests": 0,
                "hygiene": 8,
                "status": "Compliant",
            },
            {
                "station": "Dishwashing & Sanitizing",
                "cameras": 1,
                "pests": 1,
                "hygiene": 3,
                "status": "Caution",
            },
            {
                "station": "Cold Storage & Pantry",
                "cameras": 1,
                "pests": 0,
                "hygiene": 2,
                "status": "Compliant",
            },
        ],
        "inspector_notes": (
            "All kitchen personnel complied with hairnet and glove regulations. "
            "One minor apron infraction resolved immediately."
        ),
    }

    output_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "sample_compliance_report.pdf",
    )
    saved_path = generate_compliance_pdf(sample_report, output_path)
    if not os.path.exists(saved_path):
        raise SystemExit(f"PDF verification failed: {saved_path} was not created")
    file_size = os.path.getsize(saved_path)
    if file_size <= 1024:
        raise SystemExit(
            f"PDF verification failed: {saved_path} is only {file_size} bytes"
        )
    page_count = _count_pdf_pages(saved_path)
    if page_count != 1:
        raise SystemExit(
            f"PDF verification failed: expected 1 page, found {page_count}"
        )

    print("PDF compliance report verification passed")
    print(f"Report: {saved_path} ({file_size} bytes, {page_count} page)")
