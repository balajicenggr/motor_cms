export type Condition =
  | "normal"
  | "bearing_fault"
  | "imbalance"
  | "overheating"
  | "electrical_fault";

export interface SensorReading {
  id: number;
  device_id: string;
  timestamp: string;
  temperature: number;
  vibration_x: number;
  vibration_y: number;
  vibration_z: number;
  vibration_rms: number;
  sound_db: number;
  humidity: number | null;
}

export interface MLPrediction {
  id: number;
  reading_id: number;
  timestamp: string;
  condition: Condition;
  confidence: number;
  anomaly_score: number;
  probabilities: Record<Condition, number>;
  model_version: string;
}

export interface Alert {
  id: number;
  reading_id: number | null;
  timestamp: string;
  severity: "critical" | "warning" | "info";
  type: string;
  message: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
}

export interface ReadingWithPrediction extends SensorReading {
  ml_predictions: MLPrediction[];
}

export const THRESHOLDS = {
  temperature: { normal: [30, 70]  as const, warning: [70, 85]  as const, unit: "°C"   },
  vibration:   { normal: [0,  2.8] as const, warning: [2.8, 4.5] as const, unit: "mm/s" },
  sound:       { normal: [50, 70]  as const, warning: [70, 85]  as const, unit: "dB"   },
  humidity:    { normal: [30, 60]  as const, warning: [60, 70]  as const, unit: "%RH"  },
};

export type SensorStatus = "normal" | "warning" | "critical";

export function getSensorStatus(
  value: number,
  sensor: keyof typeof THRESHOLDS
): SensorStatus {
  const t = THRESHOLDS[sensor];
  if (value > t.warning[1]) return "critical";
  if (value > t.normal[1])  return "warning";
  return "normal";
}
