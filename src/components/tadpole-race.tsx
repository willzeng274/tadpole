import { useRef, useState, useEffect, useMemo, createContext, useContext, useCallback } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Environment, Tube, MeshTransmissionMaterial, OrbitControls, Html } from "@react-three/drei"
import * as THREE from "three"
import { Button } from "@/components/ui/button"
import { Play, Pause, Camera, CameraOff, RotateCcw } from "lucide-react"
import { Tadpole as TadpoleModel } from "./Tadpole"
import { Perf } from 'r3f-perf'
import { Slider } from "@/components/ui/slider"

interface TadpolePoolEntry {
  name: string
  color: string
}

// Fun tadpole names and their colors
const TADPOLE_POOL: TadpolePoolEntry[] = [
  { name: "Speedy", color: "#3498db" },
  { name: "Zippy", color: "#e74c3c" },
  { name: "Flashy", color: "#2ecc71" },
  { name: "Dashy", color: "#f39c12" },
  { name: "Splashy", color: "#9b59b6" },
  { name: "Swifty", color: "#e67e22" },
  { name: "Zappy", color: "#16a085" },
  { name: "Rushy", color: "#c0392b" },
]

interface TadpoleData {
  id: number
  name: string
  color: string
  finishTime?: number
  position?: number
}

interface RaceContextType {
  path: THREE.CatmullRomCurve3 | null
  isRunning: boolean
  registerFinish: (id: number) => void
}

interface TubeSegment {
  id: number
  curve: THREE.CatmullRomCurve3
  color: string
  thickness: number
}

const RaceContext = createContext<RaceContextType>({
  path: null,
  isRunning: false,
  registerFinish: () => {},
})

export default function TadpoleRaceSimulator() {
  const [viewMode, setViewMode] = useState<"overview" | "tadpole" | "free">("overview")
  const [selectedTadpole, setSelectedTadpole] = useState<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [cameraReset, setCameraReset] = useState(0)
  const [tadpoles, setTadpoles] = useState<TadpoleData[]>([
    { id: 1, name: "Speedy", color: "#3498db" },
    { id: 2, name: "Zippy", color: "#e74c3c" },
    { id: 3, name: "Flashy", color: "#2ecc71" },
    { id: 4, name: "Dashy", color: "#f39c12" },
  ])
  const [raceFinished, setRaceFinished] = useState(false)
  const positionCounterRef = useRef<number>(1)
  const raceStartTimeRef = useRef<number | null>(null)
  const finishedTadpolesRef = useRef<Set<number>>(new Set())
  const cameraResetRef = useRef<number>(0)
  const [numTadpoles, setNumTadpoles] = useState(4)

  const handleResetCamera = () => {
    cameraResetRef.current += 1
    setCameraReset(cameraResetRef.current)
  }

  const handleRaceStart = () => {
    if (!isRunning) {
      setTadpoles(tadpoles.map(tadpole => ({
        ...tadpole,
        finishTime: undefined,
        position: undefined
      })))
      raceStartTimeRef.current = Date.now()
      positionCounterRef.current = 1 // Reset position counter
      setRaceFinished(false)
      finishedTadpolesRef.current.clear()
    }
    setIsRunning(!isRunning)
  }

  const registerFinish = useCallback((id: number) => {
    if (!raceStartTimeRef.current) return
    
    if (finishedTadpolesRef.current.has(id)) return
    
    const currentPosition = positionCounterRef.current
    finishedTadpolesRef.current.add(id)
    
    positionCounterRef.current += 1
    
    setTadpoles(prevTadpoles => {
      const updatedTadpoles = [...prevTadpoles]
      const tadpoleIndex = updatedTadpoles.findIndex(t => t.id === id)
      
      if (tadpoleIndex !== -1 && !updatedTadpoles[tadpoleIndex].finishTime) {
        updatedTadpoles[tadpoleIndex] = {
          ...updatedTadpoles[tadpoleIndex],
          finishTime: Date.now() - raceStartTimeRef.current!,
          position: currentPosition
        }
        
        const allFinished = updatedTadpoles.every(t => t.finishTime !== undefined)
        if (allFinished) {
          setRaceFinished(true)
          setIsRunning(false)
        }
      }
      
      return updatedTadpoles
    })
  }, [])

  const handleNumTadpolesChange = (value: number[]) => {
    if (isRunning) return // Don't allow changes during race
    const newCount = value[0]
    setNumTadpoles(newCount)
    setTadpoles(
      TADPOLE_POOL.slice(0, newCount).map((t, i) => ({
        id: i + 1,
        name: t.name,
        color: t.color,
        finishTime: undefined,
        position: undefined
      }))
    )
    setSelectedTadpole(null)
  }

  return (
    <div className="relative w-full h-screen">
      <Canvas
        shadows={false}
        // gl={{
        //   antialias: false,
        //   powerPreference: "high-performance",
        //   alpha: false,
        // }}
        // dpr={[1, 1.5]}
        // performance={{ min: 0.5 }}
      >
        <Perf />
        <RaceScene
          tadpoles={tadpoles}
          selectedTadpole={selectedTadpole}
          viewMode={viewMode}
          isRunning={isRunning}
          cameraReset={cameraReset}
          registerFinish={registerFinish}
        />
      </Canvas>

      <div className="absolute top-4 left-4 flex flex-col gap-4">
        <Button onClick={handleResetCamera} variant="outline" size="icon" className="bg-white/80 hover:bg-white self-start">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <div className="bg-white/80 p-4 rounded-lg flex flex-col gap-2 min-w-[200px]">
          <label className="text-sm font-medium">Number of Tadpoles: {numTadpoles}</label>
          <Slider
            defaultValue={[4]}
            value={[numTadpoles]}
            onValueChange={handleNumTadpolesChange}
            disabled={isRunning}
            min={2}
            max={8}
            step={1}
            className="w-full"
          />
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 justify-center">
        <Button
          onClick={handleRaceStart}
          variant="default"
          className="px-4 py-2 bg-green-600 hover:bg-green-700"
        >
          {isRunning ? (
            <>
              <Pause className="mr-2 h-4 w-4" /> Pause Race
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" /> {raceFinished ? "Restart Race" : "Start Race"}
            </>
          )}
        </Button>

        <div className="w-full h-2"></div>

        <Button
          onClick={() => setViewMode("overview")}
          variant={viewMode === "overview" ? "default" : "outline"}
          className="px-4 py-2"
        >
          <CameraOff className="mr-2 h-4 w-4" /> Overview
        </Button>

        <Button
          onClick={() => setViewMode("free")}
          variant={viewMode === "free" ? "default" : "outline"}
          className="px-4 py-2"
        >
          <Camera className="mr-2 h-4 w-4" /> Free Camera
        </Button>

        <div className="w-full h-2"></div>

        {tadpoles.map((tadpole) => (
          <Button
            key={tadpole.id}
            onClick={() => {
              setSelectedTadpole(tadpole.id)
              setViewMode("tadpole")
            }}
            variant={viewMode === "tadpole" && selectedTadpole === tadpole.id ? "default" : "outline"}
            className="px-4 py-2"
            style={{
              backgroundColor: viewMode === "tadpole" && selectedTadpole === tadpole.id ? tadpole.color : undefined,
            }}
          >
            {tadpole.name}
            {tadpole.position && (
              <span className="ml-2 font-bold">{getPositionSuffix(tadpole.position)}</span>
            )}
          </Button>
        ))}
      </div>

      {raceFinished && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                      bg-black/80 text-white p-6 rounded-lg min-w-[300px]">
          <h2 className="text-2xl font-bold mb-4 text-center">Race Results</h2>
          <div className="space-y-3 mb-4">
            {tadpoles
              .slice()
              .sort((a, b) => (a.position || 999) - (b.position || 999))
              .map((tadpole) => (
                <div key={tadpole.id} className="flex justify-between items-center p-2 rounded-md"
                     style={{ backgroundColor: tadpole.position === 1 ? 'rgba(255, 215, 0, 0.2)' : 'transparent' }}>
                  <div className="flex items-center">
                    <div
                      className="w-5 h-5 rounded-full mr-3"
                      style={{ backgroundColor: tadpole.color }}
                    ></div>
                    <span className={`font-medium ${tadpole.position === 1 ? 'text-xl font-bold' : ''}`}>
                      {tadpole.name}
                    </span>
                  </div>
                  <div className="flex items-center ml-6">
                    <span className="font-bold mr-4 text-lg" 
                          style={{ 
                            color: tadpole.position === 1 ? 'gold' : 
                                  tadpole.position === 2 ? 'silver' : 
                                  tadpole.position === 3 ? '#cd7f32' : 'white' 
                          }}>
                      {getPositionSuffix(tadpole.position || 0)}
                    </span>
                    <span className="font-mono">{tadpole.finishTime ? formatTime(tadpole.finishTime) : "-"}</span>
                  </div>
                </div>
              ))}
          </div>
          <Button 
            className="mt-4 w-full bg-green-600 hover:bg-green-700 font-bold py-2" 
            onClick={() => handleRaceStart()}
          >
            Race Again
          </Button>
        </div>
      )}
    </div>
  )
}

interface RaceSceneProps {
  tadpoles: TadpoleData[]
  selectedTadpole: number | null
  viewMode: "overview" | "tadpole" | "free"
  isRunning: boolean
  cameraReset: number
  registerFinish: (id: number) => void
}

function RaceScene({ tadpoles, selectedTadpole, viewMode, isRunning, cameraReset, registerFinish }: RaceSceneProps) {
  return (
    <>
      <Environment preset="apartment" />
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />

      <RaceCourse isRunning={isRunning} registerFinish={registerFinish}>
        {tadpoles.map((tadpole) => (
          <Tadpole
            key={tadpole.id}
            id={tadpole.id}
            name={tadpole.name}
            color={tadpole.color}
            isSelected={selectedTadpole === tadpole.id}
          />
        ))}
      </RaceCourse>

      <CameraSystem viewMode={viewMode} selectedTadpole={selectedTadpole} cameraReset={cameraReset} />
    </>
  )
}

interface RaceCourseProps {
  children: React.ReactNode
  isRunning: boolean
  registerFinish: (id: number) => void
}

function RaceCourse({ children, isRunning, registerFinish }: RaceCourseProps) {
  // Create an enhanced spiral race track with extreme roller coaster elements
  const path = useMemo(() => {
    const points = [];
    const segments = 40; // More segments for a longer track with more features
    const baseRadius = 15; // Base radius for the track
    
    // Create an extended spiral path with roller coaster elements
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      
      // Base spiral rotation
      const angle = t * Math.PI * 6; // 3 full rotations
      
      // Radius with growth and pinch points
      let radiusMultiplier = 1 + t * 0.8;
      // Add some pinch points where the track gets narrower for more excitement
      radiusMultiplier *= 1 - 0.3 * Math.exp(-Math.pow(t * 10 - 2, 2) * 2);
      radiusMultiplier *= 1 - 0.3 * Math.exp(-Math.pow(t * 10 - 5, 2) * 2);
      
      // X and Z follow spiral pattern with modifications
      const x = Math.cos(angle) * baseRadius * radiusMultiplier;
      
      // Y uses more extreme elevation changes for roller coaster feel
      // Base upward trend with much higher amplitude
      const baseHeight = t * 20 - 10; 
      
      // ROLLER COASTER ELEMENTS:
      
      // 1. Major hills and drops - extreme height changes
      const hills = Math.sin(t * Math.PI * 3) * 8;
      
      // 2. Corkscrew effect - rapid height + twisting displacement
      // Only apply corkscrew in middle section (t between 0.3 and 0.6)
      const corkscrewIntensity = Math.max(0, 1 - Math.pow((t - 0.45) * 3.5, 2)) * 6;
      const corkscrew = Math.sin(t * Math.PI * 20) * corkscrewIntensity;
      
      // 3. Loop-de-loop - dramatic vertical loop near t=0.75
      const loopIntensity = Math.max(0, 1 - Math.pow((t - 0.75) * 5, 2)) * 15;
      const loop = Math.sin(t * Math.PI * 8) * loopIntensity;
      
      // 4. Final drop - steep descent in the final section
      const finalDrop = t > 0.85 ? -20 * (t - 0.85) : 0;
      
      // Combine all elements
      const y = baseHeight + hills + corkscrew + loop + finalDrop;
      
      // Z coordinate with some offset for corkscrew sections
      const z = Math.sin(angle) * baseRadius * radiusMultiplier + 
                (Math.sin(t * Math.PI * 20) * corkscrewIntensity * 0.4);

      points.push(new THREE.Vector3(x, y, z));
    }

    // Add controlled random variations to make it more interesting
    for (let i = 1; i < points.length - 1; i++) {
      if (i % 5 === 0) continue; // Keep more points fixed for structure
      
      // Use sine-based pseudo-random variations
      const seed1 = Math.sin(i * 0.573) * 10000;
      const seed2 = Math.cos(i * 0.573) * 10000;
      const seed3 = Math.sin(i * 0.873) * 10000;
      
      // Extract fractional parts for smooth pseudo-random values
      const rx = (seed1 - Math.floor(seed1)) - 0.5;
      const ry = (seed2 - Math.floor(seed2)) - 0.5;
      const rz = (seed3 - Math.floor(seed3)) - 0.5;
      
      // Add variations - smaller in Y for better control of vertical elements
      const variationScale = Math.sin(Math.PI * i / points.length) * 2;
      points[i].x += rx * variationScale;
      points[i].y += ry * variationScale * 0.5; // Less Y variation for better roller coaster control
      points[i].z += rz * variationScale;
    }

    return new THREE.CatmullRomCurve3(points, false, 'centripetal');
  }, []);

  // Create tube segments with better colors and transitions
  const tubeSegments = useMemo(() => {
    const segments: TubeSegment[] = [];
    const totalSegments = 8; // Reduced from 10 to 8 segments

    // Create a nice blue gradient with lighter colors
    const colors = [
      "#2196f3", // Light blue
      "#42a5f5", // Lighter blue
      "#64b5f6", // Even lighter blue
      "#90caf9", // Very light blue
      "#90caf9", // Very light blue
      "#64b5f6", // Even lighter blue
      "#42a5f5", // Lighter blue
      "#2196f3", // Light blue
    ];

    for (let i = 0; i < totalSegments; i++) {
      const t1 = i / totalSegments;
      const t2 = (i + 1) / totalSegments;

      const subPoints = [];
      const steps = 20; // Reduced from 30 to 20 steps for better performance

      for (let j = 0; j <= steps; j++) {
        const t = t1 + (t2 - t1) * (j / steps);
        subPoints.push(path.getPoint(t));
      }

      segments.push({
        id: i,
        curve: new THREE.CatmullRomCurve3(subPoints, false),
        color: colors[i % colors.length],
        thickness: 0.9 + Math.sin(i / totalSegments * Math.PI) * 0.2,
      });
    }

    return segments;
  }, [path]);

  const contextValue = useMemo<RaceContextType>(
    () => ({
      path,
      isRunning,
      registerFinish,
    }),
    [path, isRunning, registerFinish],
  )

  return (
    <RaceContext.Provider value={contextValue}>
      <group>
        {tubeSegments.map((segment) => (
          <Tube key={segment.id} args={[segment.curve, 32, segment.thickness, 8, false]}>
            <MeshTransmissionMaterial
              backside={false}
              samples={2}
              thickness={0.2}
              roughness={0.2}
              clearcoat={0.1}
              clearcoatRoughness={0.2}
              transmission={0.9}
              chromaticAberration={0.05}
              anisotropy={0.2}
              color={segment.color}
              distortion={0.05}
              distortionScale={0.1}
              temporalDistortion={0.05}
              opacity={0.9}
              transparent={true}
              resolution={256}
              attenuationDistance={0.5}
              attenuationColor="#ffffff"
            />
          </Tube>
        ))}
      </group>
      {children}
    </RaceContext.Provider>
  )
}

interface TadpoleProps {
  id: number
  name: string
  color: string
  isSelected: boolean
}

function Tadpole({ id, name, color, isSelected }: TadpoleProps) {
  const ref = useRef<THREE.Group>(null)
  const progressRef = useRef<number>(0)
  const speedRef = useRef<number>(0.0004 + Math.random() * 0.0002)
  const hasFinishedRef = useRef<boolean>(false)
  const lapCountRef = useRef<number>(0)

  // Create a lighter version of the color
  const lighterColor = useMemo(() => {
    const c = new THREE.Color(color)
    c.multiplyScalar(1.5) // Make it 50% brighter
    return c
  }, [color])

  const { path, isRunning, registerFinish } = useContext(RaceContext)

  useFrame((_, delta) => {
    if (!ref.current || !path) return

    if (isRunning && !hasFinishedRef.current) {
      progressRef.current += speedRef.current * delta * 60

      if (progressRef.current >= 1) {
        progressRef.current = 1
        
        if (!hasFinishedRef.current) {
          hasFinishedRef.current = true
          registerFinish(id)
        }
      }

      if (Math.random() < 0.01) {
        speedRef.current = 0.0004 + Math.random() * 0.0002
      }
    }

    const position = path.getPoint(progressRef.current)
    ref.current.position.copy(position)

    const lookAtPoint = path.getPoint(Math.min(1, progressRef.current + 0.01))
    ref.current.lookAt(lookAtPoint)
  })

  useEffect(() => {
    if (!isRunning) {
      progressRef.current = 0
      hasFinishedRef.current = false
      lapCountRef.current = 0
    }
  }, [isRunning])

  if (hasFinishedRef.current && !isRunning) return null

  return (
    <group ref={ref} userData={{ tadpoleId: id }}>
      <group scale={0.4} rotation={[0, 0, 0]}>
        <TadpoleModel material={new THREE.MeshStandardMaterial({ color: lighterColor })} />
      </group>
      
      <Html position={[0, 1.5, 0]} center>
        <div
          style={{
            color: "white",
            background: "rgba(0,0,0,0.5)",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "14px",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {name}
        </div>
      </Html>

      {isSelected && <pointLight position={[0, 0.5, 0]} distance={1.5} intensity={1} color={color} />}
    </group>
  )
}

interface CameraSystemProps {
  viewMode: "overview" | "tadpole" | "free"
  selectedTadpole: number | null
  cameraReset: number
}

function CameraSystem({ viewMode, selectedTadpole, cameraReset }: CameraSystemProps) {
  const { scene, camera } = useThree()
  const overviewControlsRef = useRef(null)
  const freeControlsRef = useRef(null)
  const tadpoleControlsRef = useRef(null)
  
  const lastTadpolePos = useRef<THREE.Vector3>(new THREE.Vector3())
  
  const initialTadpoleViewRef = useRef<boolean>(true)
  
  const cameraOffset = useRef<THREE.Vector3>(new THREE.Vector3())
  
  const lastSelectedTadpoleRef = useRef<number | null>(null)

  useEffect(() => {
    if (cameraReset > 0) {
      if (viewMode === "overview" && overviewControlsRef.current) {
        camera.position.set(0, 25, 25)
        // @ts-expect-error - OrbitControls has a target property at runtime
        overviewControlsRef.current.target.set(0, 0, 0)
        // @ts-expect-error - OrbitControls has an update method at runtime
        overviewControlsRef.current.update()
      } else if (viewMode === "free" && freeControlsRef.current) {
        camera.position.set(0, 15, 25)
        // @ts-expect-error - OrbitControls has a target property at runtime
        freeControlsRef.current.target.set(0, 0, 0)
        // @ts-expect-error - OrbitControls has an update method at runtime
        freeControlsRef.current.update()
      } else if (viewMode === "tadpole" && tadpoleControlsRef.current) {
        initialTadpoleViewRef.current = true;
        cameraOffset.current.set(0, 3, 6);
      }
    }
  }, [cameraReset, viewMode, camera])

  useEffect(() => {
    if (selectedTadpole !== lastSelectedTadpoleRef.current) {
      initialTadpoleViewRef.current = true;
      lastSelectedTadpoleRef.current = selectedTadpole;
    }
  }, [selectedTadpole]);

  useEffect(() => {
    if (overviewControlsRef.current) {
      // @ts-expect-error - OrbitControls has an enabled property at runtime
      overviewControlsRef.current.enabled = false
    }
    if (freeControlsRef.current) {
      // @ts-expect-error - OrbitControls has an enabled property at runtime
      freeControlsRef.current.enabled = false
    }
    if (tadpoleControlsRef.current) {
      // @ts-expect-error - OrbitControls has an enabled property at runtime
      tadpoleControlsRef.current.enabled = false
    }

    if (viewMode === "overview" && overviewControlsRef.current) {
      // @ts-expect-error - OrbitControls has an enabled property at runtime
      overviewControlsRef.current.enabled = true
      camera.position.set(0, 25, 25)
      // @ts-expect-error - OrbitControls has a target property at runtime
      overviewControlsRef.current.target.set(0, 0, 0)
      // @ts-expect-error - OrbitControls has an update method at runtime
      overviewControlsRef.current.update()
    } else if (viewMode === "free" && freeControlsRef.current) {
      // @ts-expect-error - OrbitControls has an enabled property at runtime
      freeControlsRef.current.enabled = true
    } else if (viewMode === "tadpole" && tadpoleControlsRef.current) {
      // @ts-expect-error - OrbitControls has an enabled property at runtime
      tadpoleControlsRef.current.enabled = true
      initialTadpoleViewRef.current = true;
    }
  }, [viewMode, camera])

  const updateCameraOffset = useCallback(() => {
    if (viewMode === "tadpole" && tadpoleControlsRef.current && !initialTadpoleViewRef.current) {
      const target = new THREE.Vector3();
      // @ts-expect-error - OrbitControls has a target property at runtime
      target.copy(tadpoleControlsRef.current.target);
      cameraOffset.current.copy(camera.position).sub(target);
    }
  }, [camera, viewMode]);

  const handleOrbitChange = useCallback(() => {
    updateCameraOffset();
  }, [updateCameraOffset]);

  useFrame(() => {
    if (viewMode === "tadpole" && selectedTadpole && tadpoleControlsRef.current) {
      let tadpoleObj: THREE.Object3D | null = null;
      scene.traverse((object) => {
        if (object.userData && object.userData.tadpoleId === selectedTadpole) {
          tadpoleObj = object;
        }
      });

      if (tadpoleObj) {
        // @ts-expect-error - We know the position property exists on Object3D at runtime
        const tadpolePos = tadpoleObj.position.clone();
        
        if (initialTadpoleViewRef.current) {
          // @ts-expect-error - OrbitControls has a target property at runtime
          tadpoleControlsRef.current.target.copy(tadpolePos);
          
          // Set initial camera position behind and slightly above the tadpole
          cameraOffset.current.set(0, 3, 6);
          
          camera.position.copy(tadpolePos).add(cameraOffset.current);
          
          // @ts-expect-error - OrbitControls has an update method at runtime
          tadpoleControlsRef.current.update();
          
          initialTadpoleViewRef.current = false;
        } else {
          updateCameraOffset();
          
          // @ts-expect-error - OrbitControls has a target property at runtime
          const previousTarget = tadpoleControlsRef.current.target.clone();
          // @ts-expect-error - OrbitControls has a target property at runtime
          tadpoleControlsRef.current.target.copy(tadpolePos);
          
          const posDiff = new THREE.Vector3().subVectors(tadpolePos, previousTarget);
          
          camera.position.add(posDiff);
          
          // @ts-expect-error - OrbitControls has an update method at runtime
          tadpoleControlsRef.current.update();
        }
        
        lastTadpolePos.current.copy(tadpolePos);
      }
    }
  });

  return (
    <>
      {viewMode === "overview" && (
        <OrbitControls
          ref={overviewControlsRef}
          makeDefault
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          maxPolarAngle={Math.PI * 0.85}
          enableDamping={true}
          dampingFactor={0.1}
        />
      )}

      {viewMode === "free" && (
        <OrbitControls
          ref={freeControlsRef}
          makeDefault
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          enableDamping={true}
          dampingFactor={0.1}
        />
      )}

      {viewMode === "tadpole" && selectedTadpole && (
        <OrbitControls
          ref={tadpoleControlsRef}
          makeDefault
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          maxPolarAngle={Math.PI * 0.85}
          onChange={handleOrbitChange}
          enableDamping={true}
          dampingFactor={0.05}
          rotateSpeed={0.5}
        />
      )}
    </>
  )
}

function getPositionSuffix(position: number): string {
  if (position === 1) return "1st";
  if (position === 2) return "2nd";
  if (position === 3) return "3rd";
  return `${position}th`;
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  return `${seconds}.${milliseconds.toString().padStart(3, '0')}s`;
}

