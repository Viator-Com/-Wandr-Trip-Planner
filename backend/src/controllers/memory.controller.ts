export const updateMemory = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { content, category } = req.body;

        const memory = await Memory.findById(req.params.memoryId);

        if (!memory) {
            res.status(404).json({
                success: false,
                message: "Memory not found"
            });
            return;
        }

        const embedding = await embedText(content);

        memory.content = content || memory.content;
        memory.category = category || memory.category;

        await memory.save();

        await insertVector({
            id: memory._id.toString(),
            vector: embedding,
            metadata: {
                userId: memory.userId,
                tripId: memory.tripId,
                category: memory.category
            }
        });

        res.status(200).json({
            success: true,
            message: "Memory updated successfully",
            memory
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};