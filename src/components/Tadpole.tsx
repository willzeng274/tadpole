import * as THREE from 'three'
import React, { JSX } from 'react'
import { useGraph } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { GLTF, SkeletonUtils } from 'three-stdlib'

type ActionName = 'ArmatureAction.002'

interface GLTFAction extends THREE.AnimationClip {
  name: ActionName
}

type GLTFResult = GLTF & {
  nodes: {
    Sphere_0: THREE.SkinnedMesh
    Armature_rootJoint: THREE.Bone
  }
  materials: {
    White: THREE.MeshStandardMaterial
  }
  animations: GLTFAction[]
}

type TadpoleProps = JSX.IntrinsicElements['group'] & {
  material?: THREE.Material
}

export function Tadpole({ material, ...props }: TadpoleProps) {
  const group = React.useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF('/tadpole-transformed.glb') as unknown as GLTFResult
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { nodes, materials } = useGraph(clone)
  const { actions } = useAnimations<GLTFAction>(animations, group)

  React.useEffect(() => {
    if (actions['ArmatureAction.002']) {
      actions['ArmatureAction.002'].play()
    }
  }, [actions])

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <primitive object={nodes.Armature_rootJoint} />
        <skinnedMesh 
          name="Sphere_0" 
          geometry={(nodes.Sphere_0 as THREE.SkinnedMesh).geometry}
          material={material || materials.White}
          skeleton={(nodes.Sphere_0 as THREE.SkinnedMesh).skeleton}
          position={[0.033, 0.325, 4.438]}
          scale={2.451}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/tadpole-transformed.glb')
