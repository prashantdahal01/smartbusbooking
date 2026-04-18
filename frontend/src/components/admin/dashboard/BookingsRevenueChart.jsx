import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function BookingsRevenueChart({ chartData = [], formatCurrency, formatNumber }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 10, right: 14, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" allowDecimals={false} tickLine={false} axisLine={false} width={36} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(value) => `NPR ${Math.round(Number(value || 0) / 1000)}k`}
        />
        <Tooltip
          cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
          contentStyle={{ borderRadius: "12px", borderColor: "#e2e8f0" }}
          formatter={(value, name) => {
            if (name === "Revenue") return [formatCurrency(value), "Revenue"];
            return [formatNumber(value), "Bookings"];
          }}
        />
        <Legend verticalAlign="top" height={30} />
        <Bar yAxisId="left" dataKey="bookings" name="Bookings" fill="#2563eb" radius={[8, 8, 0, 0]} maxBarSize={30} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="#0f766e"
          strokeWidth={3}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
