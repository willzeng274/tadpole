import { useRef, useState, useEffect, useMemo, createContext, useContext, useCallback } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Environment, Tube, MeshTransmissionMaterial, OrbitControls, Html } from "@react-three/drei"
import * as THREE from "three"
import { Button } from "@/components/ui/button"
import { Play, Pause, Camera, CameraOff, RotateCcw, DollarSign } from "lucide-react"
import { Tadpole as TadpoleModel } from "./Tadpole"
import { Perf } from 'r3f-perf'
import { Slider } from "@/components/ui/slider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"

interface TadpolePoolEntry {
  name: string
  color: string
}

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

interface TadpoleProgress {
  id: number
  progress: number
  hasFinished: boolean
}

interface RaceContextType {
  path: THREE.CatmullRomCurve3 | null
  isRunning: boolean
  registerFinish: (id: number) => void
  setTadpoleProgress: React.Dispatch<React.SetStateAction<TadpoleProgress[]>>
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
  setTadpoleProgress: () => {},
})

interface BetEntry {
  bettor: string
  amount: number
}

interface TadpoleBets {
  [tadpoleId: number]: BetEntry[]
}

// At the top of the file, add this global object
// This is outside of React's state system
const GlobalProgressTracker = {
  progressData: {} as Record<number, number>,
  updateProgress: (id: number, progress: number) => {
    GlobalProgressTracker.progressData[id] = progress;
    // Update DOM directly if element exists
    const progressElement = document.getElementById(`tadpole-progress-${id}`);
    if (progressElement) {
      progressElement.textContent = `${Math.round(progress * 100)}%`;
    }
  }
};

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

export default function TadpoleRaceSimulator() {
  const [numTadpoles, setNumTadpoles] = useState(4)
  const [tadpoles, setTadpoles] = useState<TadpoleData[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [selectedTadpole, setSelectedTadpole] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<"overview" | "tadpole" | "free">("overview")
  const [cameraReset, setCameraReset] = useState(0)
  const cameraResetRef = useRef(0)
  const positionCounterRef = useRef(1)
  const finishedTadpolesRef = useRef(new Set<number>())
  const raceStartTimeRef = useRef<number | null>(null)
  const [raceFinished, setRaceFinished] = useState(false)
  const [bets, setBets] = useState<TadpoleBets>({})
  const [showBettingDialog, setShowBettingDialog] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  
  // Replace controlled inputs with refs to reduce re-renders
  const nameInputRefs = useRef<{[key: number]: HTMLInputElement | null}>({})
  const betInputRefs = useRef<{[key: number]: HTMLInputElement | null}>({})
  
  // Create initial tadpoles and progress tracker
  useEffect(() => {
    const newTadpoles = TADPOLE_POOL.slice(0, numTadpoles).map((t, i) => ({
      id: i + 1,
      name: t.name,
      color: t.color,
      finishTime: undefined,
      position: undefined
    }));
    setTadpoles(newTadpoles);
  }, [numTadpoles])

  // Animation frame update for progress during race
  useEffect(() => {
    // Force frequent DOM updates when race is running
    let animationFrameId: number;
    const updateDom = () => {
      if (isRunning && !raceFinished) {
        // Get all tadpoles with their current progress
        const currentProgressData = tadpoles.map(tadpole => ({
          id: tadpole.id,
          name: tadpole.name,
          color: tadpole.color,
          position: tadpole.position,
          finishTime: tadpole.finishTime,
          progress: GlobalProgressTracker.progressData[tadpole.id] || 0
        }));
        
        // Sort them by position first, then by progress
        const sortedTadpoles = [...currentProgressData].sort((a, b) => {
          // If both have finished, sort by position
          if (a.position && b.position) return a.position - b.position;
          
          // If one has finished, it goes first
          if (a.position) return -1;
          if (b.position) return 1;
          
          // If neither has finished, sort by progress
          return b.progress - a.progress;
        });
        
        // Get the leaderboard container
        const leaderboardContainer = document.getElementById('leaderboard-container');
        if (leaderboardContainer) {
          // Clear and rebuild the leaderboard
          leaderboardContainer.innerHTML = '';
          
          // Rebuild with sorted items
          sortedTadpoles.forEach(tadpole => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'flex items-center gap-2';
            
            // Color dot
            const colorDot = document.createElement('div');
            colorDot.className = 'w-3 h-3 rounded-full';
            colorDot.style.backgroundColor = tadpole.color;
            itemDiv.appendChild(colorDot);
            
            // Name
            const nameSpan = document.createElement('span');
            nameSpan.textContent = tadpole.name;
            itemDiv.appendChild(nameSpan);
            
            // Position or progress
            if (tadpole.position) {
              // Show position for finished tadpoles
              const positionSpan = document.createElement('span');
              positionSpan.className = 'font-bold';
              positionSpan.textContent = getPositionSuffix(tadpole.position);
              itemDiv.appendChild(positionSpan);
            } else {
              // Show progress for running tadpoles
              const progressSpan = document.createElement('span');
              progressSpan.className = 'text-sm text-gray-400';
              progressSpan.id = `tadpole-progress-${tadpole.id}`;
              progressSpan.textContent = `${Math.round(tadpole.progress * 100)}%`;
              itemDiv.appendChild(progressSpan);
            }
            
            // Finish time if available
            if (tadpole.finishTime) {
              const timeSpan = document.createElement('span');
              timeSpan.className = 'text-sm text-gray-400';
              timeSpan.textContent = formatTime(tadpole.finishTime);
              itemDiv.appendChild(timeSpan);
            }
            
            leaderboardContainer.appendChild(itemDiv);
          });
        }
      }
      animationFrameId = requestAnimationFrame(updateDom);
    };
    
    // Start the update loop
    animationFrameId = requestAnimationFrame(updateDom);
    
    // Clean up
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isRunning, raceFinished, tadpoles]);

  const handleResetCamera = () => {
    cameraResetRef.current += 1
    setCameraReset(cameraResetRef.current)
  }

  const handleRaceStart = () => {
    if (!isRunning) {
      if (!audio.current) {
        audio.current = new Audio("/Menace.mp3")
        audio.current.volume = 0.1
      }
      audio.current.play();
      setTadpoles(tadpoles.map(tadpole => ({
        ...tadpole,
        finishTime: undefined,
        position: undefined
      })))
      raceStartTimeRef.current = Date.now()
      positionCounterRef.current = 1
      setRaceFinished(false)
      finishedTadpolesRef.current.clear()
    } else {
      audio.current?.pause();
    }
    setIsRunning(!isRunning)
  }

  // Optimize bet submission to use refs
  const submitBet = useCallback((tadpoleId: number) => {
    const nameInput = nameInputRefs.current[tadpoleId]
    const betInput = betInputRefs.current[tadpoleId]
    
    if (!nameInput || !betInput) return
    
    const betterName = nameInput.value.trim()
    const amount = parseFloat(betInput.value)
    
    if (!betterName) {
      toast("Enter your name", {
        description: "Please enter your name before placing a bet"
      })
      return
    }

    if (isNaN(amount) || amount <= 0) {
      toast("Invalid bet", {
        description: "Bet amount must be greater than 0"
      })
      return
    }

    setBets(prevBets => {
      const newBets = { ...prevBets }
      if (!newBets[tadpoleId]) {
        newBets[tadpoleId] = []
      }
      newBets[tadpoleId].push({
        bettor: betterName,
        amount: amount
      })
      return newBets
    })
    
    toast("Bet placed!", {
      description: `${betterName} bet $${amount} on ${tadpoles.find(t => t.id === tadpoleId)?.name}`
    })
    
    // Clear inputs after placing bet
    nameInput.value = ''
    betInput.value = ''
  }, [tadpoles])

  const registerFinish = useCallback((id: number) => {
    if (!raceStartTimeRef.current) return
    
    if (finishedTadpolesRef.current.has(id)) return
    
    const currentPosition = positionCounterRef.current
    finishedTadpolesRef.current.add(id)
    
    positionCounterRef.current += 1
    
    const finishTime = Date.now() - raceStartTimeRef.current

    setTadpoles(prevTadpoles => {
      return prevTadpoles.map(tadpole => {
        if (tadpole.id === id) {
          return {
            ...tadpole,
            finishTime,
            position: currentPosition
          }
        }
        return tadpole
      })
    })

    // Calculate winnings when the race is finished
    if (finishedTadpolesRef.current.size === tadpoles.length) {
      setRaceFinished(true)
      setIsRunning(false)
      audio.current?.pause();
    }
  }, [tadpoles])

  const calculateWinnings = () => {
    // Calculate total pool from all bets
    let totalPool = 0
    Object.values(bets).forEach((betList: BetEntry[]) => {
      betList.forEach((bet: BetEntry) => {
        totalPool += bet.amount
      })
    })

    // Winner gets 60% of pool, second gets 30%, third gets 10%
    const firstPlacePool = totalPool * 0.6
    const secondPlacePool = totalPool * 0.3
    const thirdPlacePool = totalPool * 0.1

    // Calculate winnings for each position
    const winnings: { [bettor: string]: number } = {}
    const sortedTadpoles = [...tadpoles].sort((a, b) => (a.position || 999) - (b.position || 999))

    // First place
    if (bets[sortedTadpoles[0].id]) {
      const firstPlaceBets = bets[sortedTadpoles[0].id]
      const totalFirstPlaceBetAmount = firstPlaceBets.reduce((sum: number, bet: BetEntry) => sum + bet.amount, 0)
      firstPlaceBets.forEach((bet: BetEntry) => {
        const share = bet.amount / totalFirstPlaceBetAmount
        winnings[bet.bettor] = (winnings[bet.bettor] || 0) + firstPlacePool * share
      })
    }

    // Second place
    if (bets[sortedTadpoles[1].id]) {
      const secondPlaceBets = bets[sortedTadpoles[1].id]
      const totalSecondPlaceBetAmount = secondPlaceBets.reduce((sum: number, bet: BetEntry) => sum + bet.amount, 0)
      secondPlaceBets.forEach((bet: BetEntry) => {
        const share = bet.amount / totalSecondPlaceBetAmount
        winnings[bet.bettor] = (winnings[bet.bettor] || 0) + secondPlacePool * share
      })
    }

    // Third place
    if (bets[sortedTadpoles[2].id]) {
      const thirdPlaceBets = bets[sortedTadpoles[2].id]
      const totalThirdPlaceBetAmount = thirdPlaceBets.reduce((sum: number, bet: BetEntry) => sum + bet.amount, 0)
      thirdPlaceBets.forEach((bet: BetEntry) => {
        const share = bet.amount / totalThirdPlaceBetAmount
        winnings[bet.bettor] = (winnings[bet.bettor] || 0) + thirdPlacePool * share
      })
    }

    return winnings
  }

  const handleNumTadpolesChange = (value: number[]) => {
    if (isRunning) return
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

  const LeaderBoard = () => {
    // Only show the leaderboard during the race, not after it's finished
    if (raceFinished) return null;

    // Initial render only - real updates happen through DOM manipulation
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white p-4 rounded-lg z-[9999]">
        <h3 className="font-bold mb-2">Leaderboard</h3>
        <div id="leaderboard-container" className="space-y-1">
          {/* Initial placeholder - will be replaced with real-time updates */}
        </div>
      </div>
    )
  }

  const ResultsDialog = () => {
    const winnings = useMemo(() => raceFinished ? calculateWinnings() : {}, []);
    const bettors = useMemo(() => {
      const allBettors = new Set<string>()
      Object.values(bets).forEach(betList => {
        betList.forEach((bet: BetEntry) => allBettors.add(bet.bettor))
      })
      return Array.from(allBettors)
    }, [])

    return (
      <>
        {raceFinished && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                        bg-black/80 text-white p-6 rounded-lg min-w-[300px] z-[99999999]">
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

            {Object.keys(bets).length > 0 && (
              <div className="mt-6 mb-4">
                <h3 className="text-lg font-bold mb-2">Betting Results</h3>
                <div className="space-y-2">
                  {bettors.map(bettor => {
                    const totalBet = Object.values(bets).reduce((sum, betList) => {
                      return sum + betList.reduce((s: number, bet: BetEntry) => bet.bettor === bettor ? s + bet.amount : s, 0)
                    }, 0)
                    const won = Math.floor(winnings[bettor] || 0)
                    const profit = won - totalBet
                    return (
                      <div key={bettor} className="flex justify-between items-center">
                        <span>{bettor}</span>
                        <span className={profit >= 0 ? "text-green-400" : "text-red-400"}>
                          {profit >= 0 ? "+" : ""}{profit}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <Button 
              className="mt-4 w-full bg-green-600 hover:bg-green-700 font-bold py-2" 
              onClick={() => {
                setRaceFinished(false);
                setBets({});
                setShowBettingDialog(true);
              }}
            >
              Race Again
            </Button>
          </div>
        )}
      </>
    )
  }

  // Memoize the bet card content to prevent unnecessary re-renders
  const BetCard = useCallback(({tadpole}: {tadpole: TadpoleData}) => {
    // Fix ref callbacks to not return a value
    const setNameInputRef = (el: HTMLInputElement | null) => {
      nameInputRefs.current[tadpole.id] = el
    }
    
    const setBetInputRef = (el: HTMLInputElement | null) => {
      betInputRefs.current[tadpole.id] = el
    }
    
    return (
      <Card key={tadpole.id} className="overflow-hidden">
        <CardHeader className="p-4 pb-2" style={{ backgroundColor: `${tadpole.color}20` }}>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">{tadpole.name}</CardTitle>
          </div>
          <CardDescription>
            {bets[tadpole.id]?.length > 0 
              ? `${bets[tadpole.id].length} bet${bets[tadpole.id].length > 1 ? 's' : ''} placed`
              : 'No bets placed yet'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`name-${tadpole.id}`}>Your Name</Label>
              <Input
                id={`name-${tadpole.id}`}
                ref={setNameInputRef}
                placeholder="Enter your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`bet-${tadpole.id}`}>Bet Amount</Label>
              <div className="flex space-x-2">
                <Input
                  id={`bet-${tadpole.id}`}
                  ref={setBetInputRef}
                  placeholder="Enter amount"
                  type="number"
                />
                <Button
                  onClick={() => submitBet(tadpole.id)}
                  variant="secondary"
                  className="whitespace-nowrap"
                >
                  Bet
                </Button>
              </div>
            </div>
          </div>
          
          {bets[tadpole.id] && bets[tadpole.id].length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Current Bets:</h4>
              <div className="space-y-1">
                {bets[tadpole.id].map((bet, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{bet.bettor}</span>
                    <span className="font-mono">${bet.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }, [bets, submitBet])

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
          onClick={isRunning ? handleRaceStart : () => setShowBettingDialog(true)}
          variant="default"
          className="px-4 py-2 bg-green-600 hover:bg-green-700"
        >
          {isRunning ? (
            <>
              <Pause className="mr-2 h-4 w-4" /> Stop Race
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" /> Start Race
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
              setSelectedTadpole(tadpole.id);
              setViewMode("tadpole");
            }}
            variant={viewMode === "tadpole" && selectedTadpole === tadpole.id ? "default" : "outline"}
            className="px-4 py-2"
            style={{
              backgroundColor: viewMode === "tadpole" && selectedTadpole === tadpole.id ? tadpole.color : undefined,
            }}
          >
            {bets[tadpole.id]?.length > 0 && (
              <DollarSign className="mr-1 h-4 w-4" />
            )}
            {tadpole.name}
            {tadpole.position && (
              <span className="ml-2 font-bold">{getPositionSuffix(tadpole.position)}</span>
            )}
            {tadpole.finishTime && ` (${formatTime(tadpole.finishTime)})`}
          </Button>
        ))}
      </div>

      <LeaderBoard />
      <ResultsDialog />

      {/* Betting Dialog */}
      <Dialog open={showBettingDialog} onOpenChange={setShowBettingDialog}>
        <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center">
              <DollarSign className="h-6 w-6 mr-2" /> Place Your Bets
            </DialogTitle>
            <DialogDescription>
              Place bets on which tadpole will win the race! Winner pool gets 60%, second place 30%, third place 10%.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              {tadpoles.map((tadpole) => (
                <BetCard key={tadpole.id} tadpole={tadpole} />
              ))}
            </div>
          </div>
          
          <div className="flex-shrink-0 pt-4 mt-2 border-t flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setShowBettingDialog(false);
                handleRaceStart();
              }}
            >
              Start Without Betting
            </Button>
            <Button
              onClick={() => {
                setShowBettingDialog(false);
                handleRaceStart();
              }}
              disabled={isRunning}
              className="bg-green-600 hover:bg-green-700"
            >
              Start Race
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <Toaster />
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
  const path = useMemo(() => {
    const points = [];
    const segments = 40;
    const baseRadius = 15;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      
      const angle = t * Math.PI * 6;

      let radiusMultiplier = 1 + t * 0.8;

      radiusMultiplier *= 1 - 0.3 * Math.exp(-Math.pow(t * 10 - 2, 2) * 2);
      radiusMultiplier *= 1 - 0.3 * Math.exp(-Math.pow(t * 10 - 5, 2) * 2);

      const x = Math.cos(angle) * baseRadius * radiusMultiplier;
      
      const baseHeight = t * 20 - 10; 

      // ROLLER COASTER ELEMENTS:
      
      const hills = Math.sin(t * Math.PI * 3) * 8;
      
      const corkscrewIntensity = Math.max(0, 1 - Math.pow((t - 0.45) * 3.5, 2)) * 6;
      const corkscrew = Math.sin(t * Math.PI * 20) * corkscrewIntensity;
      
      const loopIntensity = Math.max(0, 1 - Math.pow((t - 0.75) * 5, 2)) * 15;
      const loop = Math.sin(t * Math.PI * 8) * loopIntensity;
      
      const finalDrop = t > 0.85 ? -20 * (t - 0.85) : 0;
      
      const y = baseHeight + hills + corkscrew + loop + finalDrop;
      
      const z = Math.sin(angle) * baseRadius * radiusMultiplier + 
                (Math.sin(t * Math.PI * 20) * corkscrewIntensity * 0.4);

      points.push(new THREE.Vector3(x, y, z));
    }

    for (let i = 1; i < points.length - 1; i++) {
      if (i % 5 === 0) continue;
      
      const seed1 = Math.sin(i * 0.573) * 10000;
      const seed2 = Math.cos(i * 0.573) * 10000;
      const seed3 = Math.sin(i * 0.873) * 10000;
      
      const rx = (seed1 - Math.floor(seed1)) - 0.5;
      const ry = (seed2 - Math.floor(seed2)) - 0.5;
      const rz = (seed3 - Math.floor(seed3)) - 0.5;
      
      const variationScale = Math.sin(Math.PI * i / points.length) * 2;
      points[i].x += rx * variationScale;
      points[i].y += ry * variationScale * 0.5;
      points[i].z += rz * variationScale;
    }

    return new THREE.CatmullRomCurve3(points, false, 'centripetal');
  }, []);

  const tubeSegments = useMemo(() => {
    const segments: TubeSegment[] = [];
    const totalSegments = 8;

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
      const steps = 20;

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

  const { setTadpoleProgress } = useContext(RaceContext)

  const contextValue = useMemo<RaceContextType>(
    () => ({
      path,
      isRunning,
      registerFinish,
      setTadpoleProgress,
    }),
    [path, isRunning, registerFinish, setTadpoleProgress],
  )

  return (
    <RaceContext.Provider value={contextValue}>
      <group>
        {tubeSegments.map((segment) => (
          <Tube key={segment.id} args={[segment.curve, 32, segment.thickness, 8, false]}>
            <MeshTransmissionMaterial
              backside
              samples={4}
              thickness={0.4}
              roughness={0.1}
              clearcoat={0.2}
              clearcoatRoughness={0.1}
              transmission={0.96}
              chromaticAberration={0.1}
              anisotropy={0.5}
              color={segment.color}
              distortion={0.1}
              distortionScale={0.2}
              temporalDistortion={0.1}
              opacity={0.8}
              transparent={true}
              // this is VERY important to set to 512
              resolution={512}
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

  const lighterColor = useMemo(() => {
    const c = new THREE.Color(color)
    c.multiplyScalar(1.5)
    return c
  }, [color])

  const { path, isRunning, registerFinish, setTadpoleProgress } = useContext(RaceContext)

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

      // Update the global progress tracker
      GlobalProgressTracker.updateProgress(id, progressRef.current);

      // Still update React state for other components
      setTadpoleProgress(prev => prev.map(p => 
        p.id === id ? {
          ...p,
          progress: progressRef.current,
          hasFinished: hasFinishedRef.current
        } : p
      ))

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
      // Reset progress in global tracker
      GlobalProgressTracker.updateProgress(id, 0);
      // Reset progress state when race stops
      setTadpoleProgress(prev => prev.map(p => 
        p.id === id ? {
          ...p,
          progress: 0,
          hasFinished: false
        } : p
      ))
    }
  }, [isRunning, id, setTadpoleProgress])

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

