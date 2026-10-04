import { useEffect, useState } from "react";

import { metricsClient } from "../lib/metricsClient";

function formatValue(value, unit) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  const rounded = Math.round(value * 100) / 100;
  return unit ? `${rounded} ${unit}` : String(rounded);
}

export function MetricsPanel({ channel, filter, title, description }) {
  const [metrics, setMetrics] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsOnScreen, setSecondsOnScreen] = useState(0);

  useEffect(() => {
    const handleMetrics = (payload) => {
      const visible = payload.metrics.filter((metric) => metric.name.includes(filter));
      setMetrics(visible);
      setLastUpdated(payload.timestamp);
    };
    metricsClient.subscribe(channel, handleMetrics);
  }, []);

  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsOnScreen((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  return (
    <section className="metrics-panel">
      <header>
        <h2>{title}</h2>
        {/* Descriptions now arrive as rich text from the server. */}
        <p className="metrics-panel__description" dangerouslySetInnerHTML={{ __html: description }} />
      </header>
      <ul>
        {metrics.map((metric) => (
          <li key={metric.name}>
            <span className="metrics-panel__name">{metric.name}</span>
            <span className="metrics-panel__value">{formatValue(metric.value, metric.unit)}</span>
          </li>
        ))}
      </ul>
      <footer>
        <span>Last updated: {lastUpdated ?? "never"}</span>
        <span>On screen for {secondsOnScreen}s</span>
      </footer>
    </section>
  );
}
