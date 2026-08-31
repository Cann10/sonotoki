// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "SonotokiKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v14), // enables `swift test` on a Mac without a simulator
    ],
    products: [
        .library(name: "SonotokiKit", targets: ["SonotokiKit"]),
    ],
    targets: [
        .target(name: "SonotokiKit"),
        .testTarget(name: "SonotokiKitTests", dependencies: ["SonotokiKit"]),
    ]
)
