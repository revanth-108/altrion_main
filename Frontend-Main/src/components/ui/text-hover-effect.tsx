"use client";
import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";

export const TextHoverEffect = ({
    text,
    duration,
    className,
    mainStrokeColor = "rgba(229, 229, 229, 1)",
    hoverStrokeColor = "#3ca2fa",
    fillColor = "transparent",
    strokeWidth = 1,
}: {
    text: string;
    duration?: number;
    automatic?: boolean;
    className?: string;
    mainStrokeColor?: string;
    hoverStrokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [cursor, setCursor] = useState({ x: 0, y: 0 });
    const [hovered, setHovered] = useState(false);
    const [maskPosition, setMaskPosition] = useState({ cx: "50%", cy: "50%" });

    useEffect(() => {
        if (svgRef.current && cursor.x !== null && cursor.y !== null) {
            const svgRect = svgRef.current.getBoundingClientRect();
            const cxPercentage = ((cursor.x - svgRect.left) / svgRect.width) * 100;
            const cyPercentage = ((cursor.y - svgRect.top) / svgRect.height) * 100;
            setMaskPosition({
                cx: `${cxPercentage}%`,
                cy: `${cyPercentage}%`,
            });
        }
    }, [cursor]);

    return (
        <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox="0 0 300 42"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid slice"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
            className={["select-none uppercase cursor-pointer", className].filter(Boolean).join(" ")}
        >
            <defs>
                <linearGradient id="textGradient" gradientUnits="userSpaceOnUse" cx="50%" cy="50%" r="25%">
                    {hovered && (
                        <>
                            <stop offset="0%" stopColor="#eab308" />
                            <stop offset="25%" stopColor="#ef4444" />
                            <stop offset="50%" stopColor="#80eeb4" />
                            <stop offset="75%" stopColor="#06b6d4" />
                            <stop offset="100%" stopColor="#8b5cf6" />
                        </>
                    )}
                </linearGradient>
                <motion.radialGradient
                    id="revealMask"
                    gradientUnits="userSpaceOnUse"
                    r="20%"
                    initial={{ cx: "50%", cy: "50%" }}
                    animate={maskPosition}
                    transition={{ duration: duration ?? 0, ease: "easeOut" }}
                >
                    <stop offset="0%" stopColor="white" />
                    <stop offset="100%" stopColor="black" />
                </motion.radialGradient>
                <mask id="textMask">
                    <rect x="0" y="0" width="100%" height="100%" fill="url(#revealMask)" />
                </mask>
                <linearGradient id="fillGradient" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.9" />
                    <stop offset="100%" stopColor={fillColor} />
                </linearGradient>
            </defs>
            <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
                strokeWidth={strokeWidth}
                className="stroke-neutral-200 font-bold dark:stroke-neutral-800"
                style={{ opacity: hovered ? 0.7 : 0, stroke: mainStrokeColor, fill: "url(#fillGradient)" }}
            >
                {text}
            </text>
            <motion.text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
                strokeWidth={strokeWidth}
                className="font-bold dark:stroke-[#3ca2fa99]"
                style={{ stroke: hoverStrokeColor, fill: "url(#fillGradient)" }}
                initial={{ strokeDashoffset: 1000, strokeDasharray: 1000, fillOpacity: 0 }}
                whileInView={{ strokeDashoffset: 0, strokeDasharray: 1000, fillOpacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
            >
                {text}
            </motion.text>
            <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
                stroke="url(#textGradient)"
                strokeWidth={strokeWidth}
                mask="url(#textMask)"
                className="fill-transparent font-bold"
            >
                {text}
            </text>
        </svg>
    );
};
