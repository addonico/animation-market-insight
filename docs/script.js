const DATA_URL = "data/rq2_top20_worldwide_2016_2025.csv";
const MARKET_DATA_URL = "data/imdb_market_animation_share_2016_2025.csv";
const MARKET_COLORS = { CN: "#7759f6", NA: "#111111", JP: "#e94f3a", FR: "#2248bd" };

function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const headers = rows.shift();
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function formatUSD(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactUSD(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatGrossLabel(value) {
  return `$${(Number(value) / 1_000_000_000).toFixed(1)}B`;
}

function groupByYear(rows) {
  return [...new Set(rows.map((row) => row.year))]
    .sort()
    .map((year) => ({ year, rows: rows.filter((row) => row.year === year) }));
}

function buildSummaries(rows) {
  return groupByYear(rows).map(({ year, rows: yearRows }) => {
    const animatedRows = yearRows.filter((row) => row.is_animated === "yes");
    const nonAnimatedRows = yearRows.filter((row) => row.is_animated === "no");
    const totalGross = yearRows.reduce((sum, row) => sum + Number(row.worldwide_gross_usd), 0);
    const animatedGross = animatedRows.reduce((sum, row) => sum + Number(row.worldwide_gross_usd), 0);
    const nonAnimatedGross = totalGross - animatedGross;
    const topAnimated = animatedRows.reduce((best, row) => Number(row.worldwide_gross_usd) > Number(best.worldwide_gross_usd) ? row : best);
    const topNonAnimated = nonAnimatedRows.reduce((best, row) => Number(row.worldwide_gross_usd) > Number(best.worldwide_gross_usd) ? row : best);
    return {
      year,
      animatedRows,
      nonAnimatedRows,
      countShare: animatedRows.length / yearRows.length,
      grossShare: animatedGross / totalGross,
      animatedGross,
      nonAnimatedGross,
      topAnimated,
      topNonAnimated,
    };
  });
}

function renderMarketChart(rows) {
  const marketOrder = ["NA", "CN", "JP", "FR"];
  const chart = document.querySelector("#market-share-chart");
  const groups = marketOrder.map((code) => {
    const values = rows
      .filter((row) => row.market_code === code)
      .sort((a, b) => Number(a.year) - Number(b.year));
    return { code, market: values[0].market, values };
  });

  const individualCharts = groups.map((group) => {
    const average = group.values.reduce((sum, row) => sum + Number(row.animated_share_pct), 0) / group.values.length;
    const peak = group.values.reduce((best, row) => Number(row.animated_share_pct) > Number(best.animated_share_pct) ? row : best);
    const ariaValues = group.values.map((row) => `${row.year}: ${Number(row.animated_share_pct).toFixed(1)}%`).join(", ");
    return `
      <article class="market-chart-card" style="--market-color:${MARKET_COLORS[group.code]}">
        <header><span><b>${group.code}</b>${group.market}</span><strong>${average.toFixed(1)}% avg.</strong></header>
        <canvas data-market="${group.code}" role="img" aria-label="${group.market} animated share. ${ariaValues}"></canvas>
        <footer><span>Peak ${Number(peak.animated_share_pct).toFixed(1)}% · ${peak.year}</span><span>Animation / IMDb market sample</span></footer>
      </article>`;
  }).join("");
  const combinedAria = groups.map((group) => `${group.market}: ${group.values.map((row) => `${row.year} ${Number(row.animated_share_pct).toFixed(1)}%`).join(", ")}`).join(". ");
  chart.innerHTML = `${individualCharts}
    <article class="market-chart-card combined-market-card">
      <header><span><b>ALL</b>Four-market comparison</span><strong>Same 0–12% scale</strong></header>
      <div class="combined-market-legend" aria-label="Market comparison legend">
        ${groups.map((group) => `<span><i style="background:${MARKET_COLORS[group.code]}"></i><b>${group.code}</b>${group.market}</span>`).join("")}
      </div>
      <canvas data-market="combined" role="img" aria-label="Animated film share comparison. ${combinedAria}"></canvas>
      <footer><span>2016–2025</span><span>IMDb market samples compared</span></footer>
    </article>`;

  function drawPanel(canvas, values, color) {
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const pad = { left: 34, right: 16, top: 24, bottom: 36 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const xAt = (index) => pad.left + (plotWidth / 9) * index;
    const yAt = (value) => pad.top + plotHeight - (value / 12) * plotHeight;

    context.clearRect(0, 0, width, height);
    context.textBaseline = "middle";
    [0, 4, 8, 12].forEach((tick) => {
      const y = yAt(tick);
      context.strokeStyle = tick === 0 ? "#000" : "#d6d6d6";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(pad.left, y);
      context.lineTo(width - pad.right, y);
      context.stroke();
      context.fillStyle = "#777";
      context.textAlign = "right";
      context.font = "9px ui-monospace, monospace";
      context.fillText(`${tick}%`, pad.left - 6, y);
    });

    context.strokeStyle = color;
    context.lineWidth = 2.5;
    context.lineJoin = "round";
    context.beginPath();
    values.forEach((row, index) => {
      const x = xAt(index);
      const y = yAt(Number(row.animated_share_pct));
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    values.forEach((row, index) => {
      const share = Number(row.animated_share_pct);
      const x = xAt(index);
      const y = yAt(share);
      context.beginPath();
      context.arc(x, y, 3.7, 0, Math.PI * 2);
      context.fillStyle = "#fff";
      context.fill();
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.stroke();
      context.textAlign = "center";
      context.font = "8.5px ui-monospace, monospace";
      context.fillStyle = "#000";
      context.fillText(`${share.toFixed(1)}%`, x, Math.max(pad.top + 7, y - 13));
      context.fillStyle = "#777";
      context.fillText(String(row.year).slice(2), x, height - 15);
    });
  }

  function drawCombined(canvas) {
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const pad = { left: 42, right: 22, top: 22, bottom: 40 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const xAt = (index) => pad.left + (plotWidth / 9) * index;
    const yAt = (value) => pad.top + plotHeight - (value / 12) * plotHeight;

    context.clearRect(0, 0, width, height);
    context.textBaseline = "middle";
    [0, 2, 4, 6, 8, 10, 12].forEach((tick) => {
      const y = yAt(tick);
      context.strokeStyle = tick === 0 ? "#000" : "#d6d6d6";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(pad.left, y);
      context.lineTo(width - pad.right, y);
      context.stroke();
      context.fillStyle = "#777";
      context.textAlign = "right";
      context.font = "9px ui-monospace, monospace";
      context.fillText(`${tick}%`, pad.left - 7, y);
    });

    groups[0].values.forEach((row, index) => {
      context.fillStyle = "#777";
      context.textAlign = "center";
      context.font = "9px ui-monospace, monospace";
      context.fillText(String(row.year), xAt(index), height - 17);
    });

    groups.forEach((group) => {
      const color = MARKET_COLORS[group.code];
      context.strokeStyle = color;
      context.lineWidth = 2.5;
      context.lineJoin = "round";
      context.beginPath();
      group.values.forEach((row, index) => {
        const x = xAt(index);
        const y = yAt(Number(row.animated_share_pct));
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();

      group.values.forEach((row, index) => {
        context.beginPath();
        context.arc(xAt(index), yAt(Number(row.animated_share_pct)), 3.5, 0, Math.PI * 2);
        context.fillStyle = "#fff";
        context.fill();
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.stroke();
      });
    });
  }

  const drawAll = () => {
    groups.forEach((group) => {
      const canvas = chart.querySelector(`[data-market="${group.code}"]`);
      drawPanel(canvas, group.values, MARKET_COLORS[group.code]);
    });
    drawCombined(chart.querySelector('[data-market="combined"]'));
  };
  window.drawMarketPanels = drawAll;
  new ResizeObserver(drawAll).observe(chart);
  requestAnimationFrame(drawAll);

  const summaries = groups.map((group) => {
    const average = group.values.reduce((sum, row) => sum + Number(row.animated_share_pct), 0) / group.values.length;
    const peak = group.values.reduce((best, row) => Number(row.animated_share_pct) > Number(best.animated_share_pct) ? row : best);
    return { ...group, average, peak };
  });
  const china = summaries.find((item) => item.code === "CN");
  const northAmerica = summaries.find((item) => item.code === "NA");
  const japan = summaries.find((item) => item.code === "JP");
  const france = summaries.find((item) => item.code === "FR");

  document.querySelector("#market-summary").innerHTML = `
    <strong>Conclusion.</strong> Animation has the largest average presence in the Mainland China and Japan samples
    (both about ${((china.average + japan.average) / 2).toFixed(1)}%), followed by France (${france.average.toFixed(1)}%)
    and North America (${northAmerica.average.toFixed(1)}%). The lines do not show a common upward trend:
    animation's share changes from year to year and follows a different pattern in each market.
    As the world's largest film market, North America has the lowest animated-film share among the four samples,
    remaining consistently low and stable throughout the period.
    Japan's ${japan.peak.year} peak may be misleading: its IMDb sample falls to 891 films, from 2,330 in 2024.`;
}

function renderGrossShareChart(summaries) {
  document.querySelector("#gross-share-chart").innerHTML = summaries.map((item) => {
    const percent = item.grossShare * 100;
    const nonAnimatedPercent = 100 - percent;
    const animatedAmount = formatGrossLabel(item.animatedGross);
    const nonAnimatedAmount = formatGrossLabel(item.nonAnimatedGross);
    return `
      <div class="gross-row">
        <strong>${item.year}</strong>
        <div class="gross-track" role="img" aria-label="${item.year}: animated films ${formatUSD(item.animatedGross)}, non-animated films ${formatUSD(item.nonAnimatedGross)}; animated share ${percent.toFixed(1)} percent">
          <span class="gross-animated" style="width: ${percent}%"><b>${animatedAmount}</b></span>
          <span class="gross-non-animated" style="width: ${nonAnimatedPercent}%"><b>${nonAnimatedAmount}</b></span>
        </div>
        <span class="gross-value"><strong>${percent.toFixed(1)}%</strong></span>
      </div>`;
  }).join("");

  const highest = summaries.reduce((best, item) => item.grossShare > best.grossShare ? item : best);
  const lowest = summaries.reduce((best, item) => item.grossShare < best.grossShare ? item : best);
  const share2024 = summaries.find((item) => item.year === "2024").grossShare;
  const share2025 = summaries.find((item) => item.year === "2025").grossShare;
  document.querySelector("#gross-summary").innerHTML = `
    <strong>Conclusion.</strong> Within each year's worldwide Top 20, not the total global box office, animated films
    contributed their largest share in ${highest.year} (${(highest.grossShare * 100).toFixed(1)}%) and their smallest in
    ${lowest.year} (${(lowest.grossShare * 100).toFixed(1)}%). The recovery to ${(share2024 * 100).toFixed(1)}% in 2024
    and ${(share2025 * 100).toFixed(1)}% in 2025 shows that animation's commercial weight among leading films is volatile
    and appears to depend on breakout releases rather than steady growth.`;
}

function renderTopFilmChart(summaries) {
  const maximumGross = 3000000000;
  document.querySelector("#top-film-chart").innerHTML = summaries.map((item) => {
    const animatedGross = Number(item.topAnimated.worldwide_gross_usd);
    const nonAnimatedGross = Number(item.topNonAnimated.worldwide_gross_usd);
    return `
      <article class="top-film-year">
        <strong class="top-film-year-label">${item.year}</strong>
        <div class="top-film-pair">
          <div class="top-film-entry">
            <div class="top-film-meta"><span><b>A</b>${item.topAnimated.title}</span><strong>${formatCompactUSD(animatedGross)}</strong></div>
            <div class="top-film-track" role="img" aria-label="${item.year} top animated film: ${item.topAnimated.title}, ${formatUSD(animatedGross)} worldwide">
              <i class="top-film-bar animated-bar" style="width: ${(animatedGross / maximumGross) * 100}%"></i>
            </div>
          </div>
          <div class="top-film-entry">
            <div class="top-film-meta"><span><b>N</b>${item.topNonAnimated.title}</span><strong>${formatCompactUSD(nonAnimatedGross)}</strong></div>
            <div class="top-film-track" role="img" aria-label="${item.year} top non-animated film: ${item.topNonAnimated.title}, ${formatUSD(nonAnimatedGross)} worldwide">
              <i class="top-film-bar non-animated-bar" style="width: ${(nonAnimatedGross / maximumGross) * 100}%"></i>
            </div>
          </div>
        </div>
      </article>`;
  }).join("");
}

function renderProducerChart(rows) {
  const companyLabels = { Q1047410: "Walt Disney Animation Studios" };
  const animatedRows = rows.filter((row) => row.is_animated === "yes");
  const companyCounts = new Map();
  let filmsWithCompanyData = 0;

  animatedRows.forEach((row) => {
    const companies = row.production_companies
      .split(" | ")
      .map((company) => company.trim())
      .map((company) => companyLabels[company] || company)
      .filter(Boolean);
    if (companies.length) filmsWithCompanyData += 1;
    [...new Set(companies)].forEach((company) => {
      companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
    });
  });

  const rankedCompanies = [...companyCounts.entries()]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company));
  const visibleCompanies = rankedCompanies.slice(0, 10);
  const topCompany = rankedCompanies[0];

  document.querySelector("#producer-kpis").innerHTML = `
    <article><span>Animated films in sample</span><strong>${animatedRows.length}</strong></article>
    <article><span>Films with company data</span><strong>${filmsWithCompanyData} of ${animatedRows.length}</strong></article>
    <article><span>Distinct company labels</span><strong>${rankedCompanies.length}</strong></article>`;

  document.querySelector("#producer-chart").innerHTML = visibleCompanies.map((item, index) => {
    const share = (item.count / animatedRows.length) * 100;
    return `
      <div class="producer-row">
        <span class="producer-rank">${String(index + 1).padStart(2, "0")}</span>
        <strong class="producer-name">${item.company}</strong>
        <div class="producer-track" role="img" aria-label="${item.company}: ${item.count} films, ${share.toFixed(1)} percent of the 44 animated film records">
          <i class="producer-bar" style="width:${share}%"></i>
        </div>
        <span class="producer-count"><strong>${item.count}</strong> films · ${share.toFixed(1)}%</span>
      </div>`;
  }).join("");

  const pixarCount = companyCounts.get("Pixar") || 0;
  const marvelCount = [...companyCounts.entries()]
    .filter(([company]) => company.toLowerCase().includes("marvel"))
    .reduce((sum, [, count]) => sum + count, 0);
  document.querySelector("#producer-summary").innerHTML = `
    <strong>Conclusion.</strong> ${topCompany.company} is the most frequent credit, appearing on ${topCompany.count} of the ${animatedRows.length} animated films.
    Pixar appears on ${pixarCount}; Marvel-labelled companies appear on ${marvelCount}.
    Disney and Pixar are prominent in this sample, but Illumination, DreamWorks Animation and other production companies also appear frequently in the ranking.`;
}

function renderFilms(summaries) {
  const filter = document.querySelector("#year-filter");
  const filmTable = document.querySelector("#film-table");
  const animatedFilms = summaries.flatMap((item) => item.animatedRows);

  filter.insertAdjacentHTML("beforeend", summaries.map((item) => `<option value="${item.year}">${item.year}</option>`).join(""));

  function updateFilmTable() {
    const selectedYear = filter.value;
    const visibleFilms = selectedYear === "all"
      ? animatedFilms
      : animatedFilms.filter((row) => row.year === selectedYear);

    filmTable.innerHTML = visibleFilms.map((row) => `
      <tr>
        <td>${row.year}</td>
        <td class="number">${row.annual_rank}</td>
        <td><a href="${row.boxofficemojo_release_group_url}" rel="noopener">${row.title}</a></td>
        <td class="number">${formatUSD(Number(row.worldwide_gross_usd))}</td>
      </tr>`).join("");
  }

  filter.addEventListener("change", updateFilmTable);
  updateFilmTable();
}

function activateTab(name) {
  const links = document.querySelectorAll("[data-tab]");
  const panels = document.querySelectorAll(".tab-panel");
  const validNames = [...panels].map((panel) => panel.dataset.panel);
  const selected = validNames.includes(name) ? name : "overview";

  links.forEach((link) => link.classList.toggle("active", link.dataset.tab === selected));
  panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === selected));
  if (selected === "count-share" && window.drawMarketPanels) requestAnimationFrame(window.drawMarketPanels);

  if (location.hash.slice(1) !== selected) history.replaceState(null, "", `#${selected}`);
  window.scrollTo({ top: 0, behavior: "auto" });
}

document.querySelectorAll("[data-tab], [data-go]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    activateTab(link.dataset.tab || link.dataset.go);
  });
});

window.addEventListener("hashchange", () => activateTab(location.hash.slice(1)));
activateTab(location.hash.slice(1));

fetch(MARKET_DATA_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load ${MARKET_DATA_URL}`);
    return response.text();
  })
  .then((text) => renderMarketChart(parseCSV(text)))
  .catch((error) => {
    document.querySelector("#market-share-chart").innerHTML = `<p class="error">${error.message}. View the page through GitHub Pages or another web server.</p>`;
  });

fetch(DATA_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load ${DATA_URL}`);
    return response.text();
  })
  .then((text) => {
    const rows = parseCSV(text);
    const summaries = buildSummaries(rows);
    renderGrossShareChart(summaries);
    renderTopFilmChart(summaries);
    renderProducerChart(rows);
    renderFilms(summaries);
  })
  .catch((error) => {
    document.querySelector("#gross-share-chart").innerHTML = `<p class="error">${error.message}. View the page through GitHub Pages or another web server.</p>`;
    document.querySelector("#top-film-chart").innerHTML = `<p class="error">${error.message}. View the page through GitHub Pages or another web server.</p>`;
    document.querySelector("#producer-chart").innerHTML = `<p class="error">${error.message}. View the page through GitHub Pages or another web server.</p>`;
  });
